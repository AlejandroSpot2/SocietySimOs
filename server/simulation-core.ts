import { randomUUID } from 'node:crypto';
import type {
  BatchAggregateReport,
  BatchRunFailure,
  GlobalConsensusSummary,
  Group,
  GroupAnalysis,
  GroupMetric,
  GroupPhaseResult,
  GroupRunPhase,
  Message,
  PersonaState,
  Product,
  RemoteSparkRef,
} from '../src/types';
import {
  SCORE_MAX,
  SCORE_MIN,
  SENTIMENT_MAX,
  SENTIMENT_MIN,
  normalizeGroupAnalysis,
} from '../src/lib/metrics';
import type { AnalystPayload, MindsClientLike } from './minds-client';
import { hashFingerprint } from './utils';

interface CompletionEnvelope<T> {
  content?: string;
  parsed?: T;
}

interface GroupDiscussionOptions {
  client: MindsClientLike;
  group: Group;
  product: Product;
  personas: Array<Pick<PersonaState, 'id' | 'name' | 'remote'>>;
  phase: GroupRunPhase;
  baselineSummary?: string;
  consensusSummary?: GlobalConsensusSummary;
  signal?: AbortSignal;
  onMessage?: (event: {
    round: number;
    mindId: string;
    mindName: string;
    text: string;
    phase: GroupRunPhase;
    groupId: string;
    groupName: string;
  }) => void;
}

interface ProgressSnapshot<T> {
  item: T;
  index: number;
  completed: number;
  total: number;
  active: number;
}

const ANALYST_NAME = 'Simulation Analyst';
const ANALYST_DESCRIPTION = 'Structured analyst spark for synthetic focus-group summaries.';
const ANALYST_DISCIPLINE = 'Market Research';
const ANALYST_TAGS = ['analysis', 'market-research', 'simulation'];
const ANALYST_PROMPT = `You are a rigorous market research analyst.

Return only structured findings.
Never invent persona ids.
Keep findings grounded in the supplied transcript summaries.`;

function extractCompletionText(result: CompletionEnvelope<unknown>): string {
  if (typeof result.content === 'string' && result.content.trim()) {
    return result.content.trim();
  }

  return 'No response returned.';
}

function transcriptSnapshot(messages: Message[], limit = 8): string {
  if (messages.length === 0) {
    return 'No discussion has happened yet.';
  }

  return messages
    .slice(-limit)
    .map((message) => `${message.senderName}: ${message.text}`)
    .join('\n');
}

function orderedGroupPersonas(
  group: Group,
  personas: Array<Pick<PersonaState, 'id' | 'name' | 'remote'>>,
) {
  const personaMap = new Map(personas.map((persona) => [persona.id, persona]));
  return group.personaIds
    .map((personaId) => personaMap.get(personaId))
    .filter(Boolean) as Array<Pick<PersonaState, 'id' | 'name' | 'remote'>>;
}

function createMessage(senderId: string, senderName: string, text: string, isSystem = false): Message {
  return {
    id: randomUUID(),
    senderId,
    senderName,
    text,
    isSystem,
    createdAt: new Date().toISOString(),
  };
}

function buildBaselineTurnPrompt(
  product: Product,
  groupName: string,
  participants: string[],
  transcript: Message[],
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
${transcriptSnapshot(transcript)}

Instructions:
- ${turnInstruction}
- Stay fully in character.
- Keep the response to 3 sentences maximum.
- Be specific and conversational.
- Do not break character or mention that you are an AI.`;
}

function buildRelayTurnPrompt(
  product: Product,
  groupName: string,
  participants: string[],
  baselineSummary: string,
  consensusSummary: GlobalConsensusSummary,
): string {
  return `You are participating in the follow-up round of a synthetic focus-group discussion.

Group: ${groupName}
Participants: ${participants.join(', ')}

Product Name: ${product.name}
Category: ${product.category}
Description: ${product.description}

Your group's baseline summary:
${baselineSummary}

Broader market consensus:
Executive summary: ${consensusSummary.executiveSummary}
Top appeals: ${consensusSummary.topAppeals.join('; ') || 'None'}
Top objections: ${consensusSummary.topObjections.join('; ') || 'None'}
Polarizing points: ${consensusSummary.polarizingPoints.join('; ') || 'None'}

Instructions:
- React to the broader market consensus.
- State whether you double down, soften, or revise your position.
- Keep the response to 3 sentences maximum.
- Stay fully in character.
- Do not mention that you are an AI.`;
}

function buildGroupAnalysisPrompt(
  product: Product,
  groupName: string,
  phase: GroupRunPhase,
  personas: Array<Pick<PersonaState, 'id' | 'name'>>,
  transcript: Message[],
): string {
  return `Analyze this ${phase} synthetic focus-group transcript.

Product Name: ${product.name}
Category: ${product.category}
Description: ${product.description}
Group: ${groupName}

Persona ids and names:
${personas.map((persona) => `- ${persona.id}: ${persona.name}`).join('\n')}

Transcript:
${transcript.map((message) => `${message.senderName}: ${message.text}`).join('\n')}

Return:
- summary: concise narrative summary
- metrics: one object per persona id listed above
  - sentiment: integer from ${SENTIMENT_MIN} to ${SENTIMENT_MAX}
    - ${SENTIMENT_MIN} = strong rejection
    - 0 = mixed or neutral
    - ${SENTIMENT_MAX} = strong advocacy
  - persuasion: integer from ${SCORE_MIN} to ${SCORE_MAX}
    - ${SCORE_MIN} = completely unconvinced
    - ${SCORE_MAX} = fully convinced to buy or recommend
  - passion: integer from ${SCORE_MIN} to ${SCORE_MAX}
    - ${SCORE_MIN} = emotionally flat
    - ${SCORE_MAX} = highly animated and intense
  - Use the full scoring range when warranted. Do not use a 1-10 scale.
- topAppeals: up to 5 short bullets
- topObjections: up to 5 short bullets
- purchaseIntent: low, mixed, or high`;
}

function buildConsensusPrompt(
  product: Product,
  results: GroupPhaseResult[],
  failures: BatchRunFailure[],
): string {
  return `Build a global consensus summary from these baseline focus-group analyses.

Product Name: ${product.name}
Category: ${product.category}
Description: ${product.description}

Successful group analyses:
${results
  .map(
    (result) =>
      `Group: ${result.groupName}
Summary: ${result.analysis.summary}
Appeals: ${result.analysis.topAppeals.join('; ') || 'None'}
Objections: ${result.analysis.topObjections.join('; ') || 'None'}
Purchase intent: ${result.analysis.purchaseIntent}`,
  )
  .join('\n\n')}

Excluded failed groups:
${failures.length > 0 ? failures.map((failure) => `- ${failure.groupName}: ${failure.message}`).join('\n') : 'None'}

Return:
- executiveSummary
- topAppeals
- topObjections
- polarizingPoints
- followupQuestions`;
}

function buildFinalAggregatePrompt(
  product: Product,
  baselineConsensus: GlobalConsensusSummary,
  relayResults: GroupPhaseResult[],
  failedGroups: string[],
): string {
  return `Build a final aggregate report for this synthetic focus-group batch.

Product Name: ${product.name}
Category: ${product.category}
Description: ${product.description}

Baseline consensus:
Executive summary: ${baselineConsensus.executiveSummary}
Top appeals: ${baselineConsensus.topAppeals.join('; ') || 'None'}
Top objections: ${baselineConsensus.topObjections.join('; ') || 'None'}
Polarizing points: ${baselineConsensus.polarizingPoints.join('; ') || 'None'}

Relay analyses:
${relayResults
  .map(
    (result) =>
      `Group: ${result.groupName}
Summary: ${result.analysis.summary}
Appeals: ${result.analysis.topAppeals.join('; ') || 'None'}
Objections: ${result.analysis.topObjections.join('; ') || 'None'}
Purchase intent: ${result.analysis.purchaseIntent}`,
  )
  .join('\n\n')}

Failed groups:
${failedGroups.length > 0 ? failedGroups.join('\n') : 'None'}

Return:
- summary
- topAppeals
- topObjections
- consensusShifts
- failedGroups`;
}

function parseStructuredResult<T extends object>(
  result: CompletionEnvelope<T>,
  guard: (value: unknown) => value is T,
  errorMessage: string,
): T {
  if (guard(result.parsed)) {
    return result.parsed;
  }

  if (result.content) {
    try {
      const parsed = JSON.parse(result.content) as unknown;
      if (guard(parsed)) {
        return parsed;
      }
    } catch {
      // noop
    }
  }

  throw new Error(errorMessage);
}

function isGroupAnalysis(value: unknown): value is GroupAnalysis {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'summary' in value &&
      typeof (value as GroupAnalysis).summary === 'string' &&
      Array.isArray((value as GroupAnalysis).metrics),
  );
}

function isConsensusSummary(value: unknown): value is GlobalConsensusSummary {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'executiveSummary' in value &&
      typeof (value as GlobalConsensusSummary).executiveSummary === 'string',
  );
}

function isAggregateNarrative(
  value: unknown,
): value is Pick<BatchAggregateReport, 'summary' | 'topAppeals' | 'topObjections' | 'consensusShifts' | 'failedGroups'> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'summary' in value &&
      typeof (value as BatchAggregateReport).summary === 'string',
  );
}

function analystFingerprint(): string {
  return hashFingerprint([ANALYST_NAME, ANALYST_DISCIPLINE, ANALYST_PROMPT, ANALYST_TAGS.join(',')]);
}

export function buildRemoteGroupFingerprint(group: Group, sparkIds: string[]): string {
  return hashFingerprint(['remote-group', group.name, group.personaIds.join(','), sparkIds.join(',')]);
}

export function clampConcurrency(rawValue: number | undefined, min = 1, max = 10): number {
  if (!Number.isFinite(rawValue)) {
    return 4;
  }

  return Math.min(max, Math.max(min, Math.trunc(rawValue as number)));
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  runner: (item: T, index: number) => Promise<R>,
  onProgress?: {
    onStart?: (snapshot: ProgressSnapshot<T>) => void;
    onFinish?: (snapshot: ProgressSnapshot<T>) => void;
  },
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  const limit = clampConcurrency(concurrency, 1, Math.max(1, concurrency));
  let nextIndex = 0;
  let active = 0;
  let completed = 0;

  return new Promise<R[]>((resolve, reject) => {
    const launchNext = () => {
      if (completed === items.length) {
        resolve(results);
        return;
      }

      while (active < limit && nextIndex < items.length) {
        const index = nextIndex;
        const item = items[index];
        nextIndex += 1;
        active += 1;
        onProgress?.onStart?.({
          item,
          index,
          completed,
          total: items.length,
          active,
        });

        runner(item, index)
          .then((result) => {
            results[index] = result;
          })
          .catch(reject)
          .finally(() => {
            active -= 1;
            completed += 1;
            onProgress?.onFinish?.({
              item,
              index,
              completed,
              total: items.length,
              active,
            });
            launchNext();
          });
      }
    };

    launchNext();
  });
}

export async function ensureAnalystSpark(
  client: MindsClientLike,
  analystSpark?: RemoteSparkRef | null,
): Promise<RemoteSparkRef> {
  const fingerprint = analystFingerprint();
  if (analystSpark?.sparkId && analystSpark.fingerprint === fingerprint) {
    return analystSpark;
  }

  let sparkId = analystSpark?.sparkId;
  if (!sparkId) {
    const matches = await client.listSparks(ANALYST_NAME);
    const exact = matches.find((spark) => spark.name === ANALYST_NAME);
    sparkId = exact?.id;
  }

  const payload: AnalystPayload = {
    name: ANALYST_NAME,
    description: ANALYST_DESCRIPTION,
    discipline: ANALYST_DISCIPLINE,
    prompt: ANALYST_PROMPT,
    tags: ANALYST_TAGS,
  };

  if (!sparkId) {
    const created = await client.createAnalystSpark(payload);
    sparkId = created.id;
  }

  await client.updateSpark(sparkId, payload, 'expert');
  return {
    sparkId,
    fingerprint,
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function runGroupDiscussion(options: GroupDiscussionOptions): Promise<{
  transcript: Message[];
  startedAt: string;
  completedAt: string;
}> {
  const orderedPersonas = orderedGroupPersonas(options.group, options.personas);
  if (orderedPersonas.length === 0) {
    throw new Error(`Group ${options.group.name} has no synced sparks.`);
  }

  const missingRemote = orderedPersonas.find((persona) => !persona.remote?.sparkId);
  if (missingRemote) {
    throw new Error(`Persona ${missingRemote.name} is missing a synced spark id.`);
  }

  const transcript: Message[] = [];
  const startedAt = new Date().toISOString();
  const participants = orderedPersonas.map((persona) => persona.name);
  const rounds = options.phase === 'baseline' ? [1, 2] : [1];

  for (const round of rounds) {
    for (const persona of orderedPersonas) {
      const prompt =
        options.phase === 'baseline'
          ? buildBaselineTurnPrompt(options.product, options.group.name, participants, transcript, round)
          : buildRelayTurnPrompt(
              options.product,
              options.group.name,
              participants,
              options.baselineSummary ?? 'No baseline summary available.',
              options.consensusSummary ?? {
                executiveSummary: 'No consensus summary available.',
                topAppeals: [],
                topObjections: [],
                polarizingPoints: [],
                followupQuestions: [],
              },
            );

      const completion = await options.client.completeSpark<CompletionEnvelope<unknown>>(
        persona.remote!.sparkId,
        {
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        options.signal,
      );

      const text = extractCompletionText(completion);
      const message = createMessage(persona.id, persona.name, text);
      transcript.push(message);
      options.onMessage?.({
        round,
        groupId: options.group.id,
        groupName: options.group.name,
        phase: options.phase,
        mindId: persona.id,
        mindName: persona.name,
        text,
      });
    }
  }

  return {
    transcript,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export async function analyzeGroupTranscript(
  client: MindsClientLike,
  analystSpark: RemoteSparkRef,
  product: Product,
  group: Group,
  personas: Array<Pick<PersonaState, 'id' | 'name'>>,
  transcript: Message[],
  phase: GroupRunPhase,
  signal?: AbortSignal,
): Promise<GroupAnalysis> {
  const result = await client.completeSpark<CompletionEnvelope<GroupAnalysis>>(
    analystSpark.sparkId,
    {
      messages: [
        {
          role: 'user',
          content: buildGroupAnalysisPrompt(product, group.name, phase, personas, transcript),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: `group_${phase}_analysis`,
          strict: true,
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              metrics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    sentiment: {
                      type: 'integer',
                      minimum: SENTIMENT_MIN,
                      maximum: SENTIMENT_MAX,
                    },
                    persuasion: {
                      type: 'integer',
                      minimum: SCORE_MIN,
                      maximum: SCORE_MAX,
                    },
                    passion: {
                      type: 'integer',
                      minimum: SCORE_MIN,
                      maximum: SCORE_MAX,
                    },
                  },
                  required: ['id', 'sentiment', 'persuasion', 'passion'],
                },
              },
              topAppeals: {
                type: 'array',
                items: { type: 'string' },
              },
              topObjections: {
                type: 'array',
                items: { type: 'string' },
              },
              purchaseIntent: {
                type: 'string',
                enum: ['low', 'mixed', 'high'],
              },
            },
            required: ['summary', 'metrics', 'topAppeals', 'topObjections', 'purchaseIntent'],
          },
        },
      },
    },
    signal,
  );

  return normalizeGroupAnalysis(
    parseStructuredResult<GroupAnalysis>(
      result,
      isGroupAnalysis,
      `Group ${group.name} ${phase} analysis did not contain a valid JSON payload.`,
    ),
  );
}

export async function buildBaselineConsensus(
  client: MindsClientLike,
  analystSpark: RemoteSparkRef,
  product: Product,
  baselineResults: GroupPhaseResult[],
  failures: BatchRunFailure[],
  signal?: AbortSignal,
): Promise<GlobalConsensusSummary> {
  const result = await client.completeSpark<CompletionEnvelope<GlobalConsensusSummary>>(
    analystSpark.sparkId,
    {
      messages: [
        {
          role: 'user',
          content: buildConsensusPrompt(product, baselineResults, failures),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'baseline_consensus_summary',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              executiveSummary: { type: 'string' },
              topAppeals: {
                type: 'array',
                items: { type: 'string' },
              },
              topObjections: {
                type: 'array',
                items: { type: 'string' },
              },
              polarizingPoints: {
                type: 'array',
                items: { type: 'string' },
              },
              followupQuestions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: [
              'executiveSummary',
              'topAppeals',
              'topObjections',
              'polarizingPoints',
              'followupQuestions',
            ],
          },
        },
      },
    },
    signal,
  );

  return parseStructuredResult<GlobalConsensusSummary>(
    result,
    isConsensusSummary,
    'Baseline consensus did not contain a valid JSON payload.',
  );
}

export function averagePersonaMetrics(results: GroupPhaseResult[]): GroupMetric[] {
  const buckets = new Map<string, { count: number; sentiment: number; persuasion: number; passion: number }>();

  for (const result of results) {
    for (const metric of result.analysis.metrics) {
      const bucket = buckets.get(metric.id) ?? {
        count: 0,
        sentiment: 0,
        persuasion: 0,
        passion: 0,
      };
      bucket.count += 1;
      bucket.sentiment += metric.sentiment;
      bucket.persuasion += metric.persuasion;
      bucket.passion += metric.passion;
      buckets.set(metric.id, bucket);
    }
  }

  return Array.from(buckets.entries())
    .map(([id, bucket]) => ({
      id,
      sentiment: Math.round(bucket.sentiment / bucket.count),
      persuasion: Math.round(bucket.persuasion / bucket.count),
      passion: Math.round(bucket.passion / bucket.count),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildGroupComparisons(results: GroupPhaseResult[]): BatchAggregateReport['groupComparisons'] {
  return results.map((result) => {
    const metrics = result.analysis.metrics;
    const divisor = Math.max(metrics.length, 1);

    return {
      groupId: result.groupId,
      groupName: result.groupName,
      averageSentiment: Math.round(metrics.reduce((sum, metric) => sum + metric.sentiment, 0) / divisor),
      averagePersuasion: Math.round(metrics.reduce((sum, metric) => sum + metric.persuasion, 0) / divisor),
      averagePassion: Math.round(metrics.reduce((sum, metric) => sum + metric.passion, 0) / divisor),
      purchaseIntent: result.analysis.purchaseIntent,
    };
  });
}

export async function buildFinalBatchAggregate(
  client: MindsClientLike,
  analystSpark: RemoteSparkRef,
  product: Product,
  baselineConsensus: GlobalConsensusSummary,
  relayResults: GroupPhaseResult[],
  failures: BatchRunFailure[],
  signal?: AbortSignal,
): Promise<BatchAggregateReport> {
  const failedGroupNames = failures.map((failure) => `${failure.groupName} (${failure.phase})`);
  const averagedPersonaMetrics = averagePersonaMetrics(relayResults);
  const groupComparisons = buildGroupComparisons(relayResults);

  const result = await client.completeSpark<
    CompletionEnvelope<
      Pick<BatchAggregateReport, 'summary' | 'topAppeals' | 'topObjections' | 'consensusShifts' | 'failedGroups'>
    >
  >(
    analystSpark.sparkId,
    {
      messages: [
        {
          role: 'user',
          content: buildFinalAggregatePrompt(product, baselineConsensus, relayResults, failedGroupNames),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'batch_final_aggregate',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              topAppeals: { type: 'array', items: { type: 'string' } },
              topObjections: { type: 'array', items: { type: 'string' } },
              consensusShifts: { type: 'array', items: { type: 'string' } },
              failedGroups: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'topAppeals', 'topObjections', 'consensusShifts', 'failedGroups'],
          },
        },
      },
    },
    signal,
  );

  const narrative = parseStructuredResult(
    result,
    isAggregateNarrative,
    'Final aggregate report did not contain a valid JSON payload.',
  );

  return {
    summary: narrative.summary,
    topAppeals: narrative.topAppeals,
    topObjections: narrative.topObjections,
    consensusShifts: narrative.consensusShifts,
    failedGroups: failedGroupNames,
    averagePersonaMetrics: averagedPersonaMetrics,
    groupComparisons,
  };
}
