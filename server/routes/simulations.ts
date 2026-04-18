import { Router } from 'express';
import type { Response } from 'express';
import type { Group, PanelStreamEvent, PersonaState, Product, RemoteSparkRef } from '../../src/types';
import { getServerConfig } from '../config';
import { MindsApiError, MindsClient } from '../minds-client';
import { hashFingerprint, parseJsonSafely } from '../utils';

interface PanelRunRequest {
  group: Group;
  product: Product;
  personas: Array<Pick<PersonaState, 'id' | 'name' | 'remote'>>;
}

interface AnalyzeRequest {
  product: Product;
  personas: Array<Pick<PersonaState, 'id' | 'name'>>;
  transcript: string;
  analystSpark?: RemoteSparkRef | null;
}

interface AnalysisResult {
  summary: string;
  metrics: Array<{
    id: string;
    sentiment: number;
    persuasion: number;
    passion: number;
  }>;
}

interface SparkCompletionResponse {
  content?: string;
  parsed?: AnalysisResult;
}

function writeSse(response: Response, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function extractCompletionText(result: SparkCompletionResponse): string {
  if (typeof result.content === 'string' && result.content.trim()) {
    return result.content.trim();
  }

  return 'No response returned.';
}

function buildTranscriptSnapshot(lines: string[], limit = 8): string {
  if (lines.length === 0) {
    return 'No other participants have spoken yet.';
  }

  return lines.slice(-limit).join('\n');
}

function buildSparkTurnPrompt(
  product: Product,
  groupName: string,
  participants: string[],
  transcript: string[],
  round: number,
): string {
  const turnInstruction =
    round === 1
      ? 'Give your opening take on the product.'
      : 'React to the discussion so far and add one new concrete point.';

  return `You are participating in a synthetic focus-group discussion.

Group: ${groupName}
Participants: ${participants.join(', ')}

Product Name: ${product.name}
Category: ${product.category}
Description: ${product.description}

Discussion so far:
${buildTranscriptSnapshot(transcript)}

Instructions:
- ${turnInstruction}
- Stay fully in character.
- Keep the response to 3 sentences maximum.
- Be specific and conversational.
- Do not break character or mention that you are an AI.`;
}

function orderedGroupPersonas(
  group: Group,
  personas: Array<Pick<PersonaState, 'id' | 'name' | 'remote'>>,
): Array<Pick<PersonaState, 'id' | 'name' | 'remote'>> {
  const personaMap = new Map(personas.map((persona) => [persona.id, persona]));
  return group.personaIds
    .map((personaId) => personaMap.get(personaId))
    .filter(Boolean) as Array<Pick<PersonaState, 'id' | 'name' | 'remote'>>;
}

async function ensureAnalystSpark(
  client: MindsClient,
  analystSpark: RemoteSparkRef | null | undefined,
): Promise<RemoteSparkRef> {
  const name = 'Simulation Analyst';
  const description = 'Structured analyst spark for synthetic focus-group summaries.';
  const discipline = 'Market Research';
  const prompt = `You are a rigorous market research analyst.

Return only structured findings.
Produce a 3-sentence summary and per-persona metrics.
Never invent persona ids.
Metrics:
- sentiment: integer from -100 to 100
- persuasion: integer from 0 to 100
- passion: integer from 0 to 100`;
  const tags = ['analysis', 'market-research', 'simulation'];
  const fingerprint = hashFingerprint([name, discipline, prompt, tags.join(',')]);

  if (analystSpark?.sparkId && analystSpark.fingerprint === fingerprint) {
    return analystSpark;
  }

  let sparkId = analystSpark?.sparkId;
  if (!sparkId) {
    const created = await client.createAnalystSpark({
      name,
      description,
      discipline,
      prompt,
      tags,
    });
    sparkId = created.id;
  }

  await client.updateSpark(
    sparkId,
    {
      name,
      description,
      discipline,
      prompt,
      tags,
    },
    'expert',
  );

  return {
    sparkId,
    fingerprint,
    lastSyncedAt: new Date().toISOString(),
  };
}

export const simulationsRouter = Router();

simulationsRouter.post('/panel-run', async (request, response) => {
  const config = getServerConfig();
  if (!config.configured) {
    response.status(503).json({ message: 'MINDS_API_KEY is not configured on the server.' });
    return;
  }

  const body = request.body as PanelRunRequest;
  if (!body?.product || !body.group || !Array.isArray(body.personas)) {
    response.status(400).json({ message: 'group, product, and personas are required.' });
    return;
  }

  const orderedPersonas = orderedGroupPersonas(body.group, body.personas);
  if (orderedPersonas.length === 0) {
    response.status(400).json({ message: 'Selected group has no synced sparks.' });
    return;
  }

  const missingRemote = orderedPersonas.find((persona) => !persona.remote?.sparkId);
  if (missingRemote) {
    response.status(400).json({
      message: `Persona ${missingRemote.name} is missing a synced spark id.`,
    });
    return;
  }

  const client = new MindsClient();
  const controller = new AbortController();
  request.on('aborted', () => controller.abort());
  response.on('close', () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();

  const transcript: string[] = [];
  const participantNames = orderedPersonas.map((persona) => persona.name);

  try {
    writeSse(response, 'panel', {
      type: 'system',
      text: `Running ${orderedPersonas.length} spark(s) for "${body.group.name}".`,
    } satisfies PanelStreamEvent);

    for (let round = 1; round <= 2; round += 1) {
      if (controller.signal.aborted) {
        throw new Error('Simulation aborted.');
      }

      writeSse(response, 'panel', {
        type: 'system',
        text: `Round ${round}/2`,
      } satisfies PanelStreamEvent);

      for (const persona of orderedPersonas) {
        if (controller.signal.aborted) {
          throw new Error('Simulation aborted.');
        }

        const completion = await client.completeSpark<SparkCompletionResponse>(persona.remote!.sparkId, {
          messages: [
            {
              role: 'user',
              content: buildSparkTurnPrompt(
                body.product,
                body.group.name,
                participantNames,
                transcript,
                round,
              ),
            },
          ],
        }, controller.signal);

        const text = extractCompletionText(completion);
        transcript.push(`${persona.name}: ${text}`);

        writeSse(response, 'panel', {
          type: 'mind_message',
          mindId: persona.id,
          mindName: persona.name,
          text,
        } satisfies PanelStreamEvent);
      }
    }

    writeSse(response, 'panel', {
      type: 'complete',
      text: 'Spark orchestration completed.',
    } satisfies PanelStreamEvent);
    response.end();
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    const message = aborted
      ? 'Simulation aborted.'
      : error instanceof Error
        ? error.message
        : 'Simulation failed.';

    writeSse(response, 'panel', {
      type: aborted ? 'system' : 'error',
      text: message,
    } satisfies PanelStreamEvent);
    response.end();
  }
});

simulationsRouter.post('/analyze', async (request, response) => {
  const config = getServerConfig();
  if (!config.configured) {
    response.status(503).json({ message: 'MINDS_API_KEY is not configured on the server.' });
    return;
  }

  const body = request.body as AnalyzeRequest;
  if (!body?.product || !body?.personas || !body?.transcript) {
    response.status(400).json({ message: 'product, personas, and transcript are required.' });
    return;
  }

  const client = new MindsClient();

  try {
    const analyst = await ensureAnalystSpark(client, body.analystSpark);
    const prompt = `Analyze this synthetic focus-group transcript.

Product Name: ${body.product.name}
Category: ${body.product.category}
Description: ${body.product.description}

Persona ids and names:
${body.personas.map((persona) => `- ${persona.id}: ${persona.name}`).join('\n')}

Transcript:
${body.transcript}

Return:
- summary: exactly 3 sentences
- metrics: one object per persona id listed above`;

    const result = await client.completeSpark<{
      content?: string;
      parsed?: AnalysisResult;
    }>(analyst.sparkId, {
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'simulation_analysis',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
              },
              metrics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    sentiment: { type: 'integer' },
                    persuasion: { type: 'integer' },
                    passion: { type: 'integer' },
                  },
                  required: ['id', 'sentiment', 'persuasion', 'passion'],
                },
              },
            },
            required: ['summary', 'metrics'],
          },
        },
      },
    });

    const parsed =
      result.parsed ?? (result.content ? parseJsonSafely<AnalysisResult>(result.content) : null);

    if (!parsed || typeof parsed !== 'object' || !('summary' in parsed) || !('metrics' in parsed)) {
      throw new Error('Analysis response did not contain a valid JSON payload.');
    }

    response.json({
      analyst,
      summary: parsed.summary,
      metrics: parsed.metrics,
    });
  } catch (error) {
    if (error instanceof MindsApiError) {
      response.status(error.status).json({
        message: error.message,
        details: error.body,
      });
      return;
    }

    response.status(500).json({
      message: error instanceof Error ? error.message : 'Analysis failed.',
    });
  }
});
