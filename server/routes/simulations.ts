import { Router } from 'express';
import type { RequestHandler, Response } from 'express';
import type {
  BatchRunConfig,
  BatchRunFailure,
  BatchRunRecord,
  BatchRunStatus,
  BatchRunStreamEvent,
  Group,
  GroupAnalysis,
  GroupPhaseResult,
  GroupRunStreamEvent,
  PersonaState,
  Product,
  RemoteSparkRef,
} from '../../src/types';
import { getServerConfig, type ServerConfig } from '../config';
import { MindsApiError, MindsClient, type MindsClientLike } from '../minds-client';
import {
  analyzeGroupTranscript,
  buildFinalBatchAggregate,
  buildBaselineConsensus,
  clampConcurrency,
  ensureAnalystSpark,
  runGroupDiscussion,
  runWithConcurrency,
} from '../simulation-core';

interface GroupRunRequest {
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

interface BatchRunRequest {
  config: BatchRunConfig;
  product: Product;
  groups: Group[];
  personas: Array<Pick<PersonaState, 'id' | 'name' | 'remote'>>;
}

interface SimulationsRouterOptions {
  clientFactory?: () => MindsClientLike;
  getConfig?: () => ServerConfig;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function writeSse(response: Response, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function streamGroupEvent(response: Response, event: GroupRunStreamEvent) {
  writeSse(response, 'group', event);
}

function streamBatchEvent(response: Response, event: BatchRunStreamEvent) {
  writeSse(response, 'batch', event);
}

function normalizedMessage(error: unknown, fallback: string): string {
  if (error instanceof MindsApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function createFailure(
  groupId: string,
  groupName: string,
  phase: BatchRunFailure['phase'],
  message: string,
): BatchRunFailure {
  return { groupId, groupName, phase, message };
}

function respondJsonError(error: unknown, response: Response, fallback = 'Analysis failed.') {
  if (error instanceof MindsApiError) {
    response.status(error.status).json({
      message: error.message,
      details: error.body,
    });
    return;
  }

  response.status(500).json({
    message: normalizedMessage(error, fallback),
  });
}

function syntheticGroupForAnalysis(personas: Array<Pick<PersonaState, 'id' | 'name'>>): Group {
  return {
    id: 'single-run',
    name: 'Single Run',
    personaIds: personas.map((persona) => persona.id),
  };
}

function groupResultsById(results: GroupPhaseResult[]) {
  return new Map(results.map((result) => [result.groupId, result]));
}

function finalizeStatus(
  baselineResults: GroupPhaseResult[],
  relayResults: GroupPhaseResult[],
  failures: BatchRunFailure[],
  current: BatchRunStatus = 'running',
): BatchRunStatus {
  if (current === 'aborted' || current === 'failed') {
    return current;
  }

  if (baselineResults.length === 0) {
    return 'failed';
  }

  if (failures.length > 0) {
    return 'completed_with_errors';
  }

  if (relayResults.length > 0 || baselineResults.length > 0) {
    return 'completed';
  }

  return current;
}

function createGroupRunHandler(
  clientFactory: () => MindsClientLike,
  getConfigValue: () => ServerConfig,
): RequestHandler {
  return async (request, response) => {
    const config = getConfigValue();
    if (!config.configured) {
      response.status(503).json({ message: 'MINDS_API_KEY is not configured on the server.' });
      return;
    }

    const body = request.body as GroupRunRequest;
    if (!body?.product || !body.group || !Array.isArray(body.personas)) {
      response.status(400).json({ message: 'group, product, and personas are required.' });
      return;
    }

    const missingPersona = body.group.personaIds.find(
      (personaId) => !body.personas.find((persona) => persona.id === personaId),
    );
    if (missingPersona) {
      response.status(400).json({ message: `Group persona ${missingPersona} is missing from the request.` });
      return;
    }

    const missingRemote = body.group.personaIds.find(
      (personaId) => !body.personas.find((persona) => persona.id === personaId)?.remote?.sparkId,
    );
    if (missingRemote) {
      response.status(400).json({ message: `Group persona ${missingRemote} is missing a synced remote spark.` });
      return;
    }

    const client = clientFactory();
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

    try {
      streamGroupEvent(response, {
        type: 'system',
        text: `Running ${body.group.personaIds.length} spark(s) for "${body.group.name}".`,
      });

      const discussion = await runGroupDiscussion({
        client,
        group: body.group,
        product: body.product,
        personas: body.personas,
        phase: 'baseline',
        signal: controller.signal,
        onMessage: (event) => {
          streamGroupEvent(response, {
            type: 'mind_message',
            mindId: event.mindId,
            mindName: event.mindName,
            text: event.text,
          });
        },
      });

      if (controller.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      streamGroupEvent(response, {
        type: 'complete',
        text: `Completed ${discussion.transcript.length} message(s).`,
      });
      response.end();
    } catch (error) {
      const aborted = controller.signal.aborted || isAbortError(error);
      streamGroupEvent(response, {
        type: aborted ? 'system' : 'error',
        text: aborted ? 'Simulation aborted.' : normalizedMessage(error, 'Simulation failed.'),
      });
      response.end();
    }
  };
}

async function runBatchPhase(
  response: Response,
  phase: 'baseline' | 'relay',
  groups: Group[],
  concurrency: number,
  runner: (group: Group, index: number) => Promise<void>,
) {
  await runWithConcurrency(
    groups,
    concurrency,
    async (group, index) => {
      await runner(group, index);
      return null;
    },
    {
      onStart: ({ active, completed, total }) => {
        streamBatchEvent(response, {
          type: 'batch_status',
          phase,
          completedGroups: completed,
          totalGroups: total,
          activeGroups: active,
        });
      },
      onFinish: ({ active, completed, total }) => {
        streamBatchEvent(response, {
          type: 'batch_status',
          phase,
          completedGroups: completed,
          totalGroups: total,
          activeGroups: active,
        });
      },
    },
  );
}

function createBatchRunHandler(
  clientFactory: () => MindsClientLike,
  getConfigValue: () => ServerConfig,
): RequestHandler {
  return async (request, response) => {
    const config = getConfigValue();
    if (!config.configured) {
      response.status(503).json({ message: 'MINDS_API_KEY is not configured on the server.' });
      return;
    }

    const body = request.body as BatchRunRequest;
    if (!body?.config || !body?.product || !Array.isArray(body.groups) || !Array.isArray(body.personas)) {
      response.status(400).json({ message: 'config, product, groups, and personas are required.' });
      return;
    }

    const selectedGroups = body.config.groupIds
      .map((groupId) => body.groups.find((group) => group.id === groupId))
      .filter(Boolean) as Group[];

    if (selectedGroups.length === 0) {
      response.status(400).json({ message: 'Batch run requires at least one selected group.' });
      return;
    }

    const missingPersona = selectedGroups
      .flatMap((group) => group.personaIds.map((personaId) => ({ group, personaId })))
      .find(({ personaId }) => !body.personas.find((persona) => persona.id === personaId));
    if (missingPersona) {
      response.status(400).json({
        message: `Group ${missingPersona.group.name} references a persona that is missing from the request.`,
      });
      return;
    }

    const missingRemote = selectedGroups
      .flatMap((group) => group.personaIds.map((personaId) => ({ group, personaId })))
      .find(({ personaId }) => !body.personas.find((persona) => persona.id === personaId)?.remote?.sparkId);
    if (missingRemote) {
      response.status(400).json({
        message: `Group ${missingRemote.group.name} cannot run because one or more personas are missing synced remote sparks.`,
      });
      return;
    }

    const invalidGroup = selectedGroups.find(
      (group) => group.personaIds.length === 0 || group.personaIds.length > config.maxPanelMinds,
    );
    if (invalidGroup) {
      response.status(400).json({
        message: `Group ${invalidGroup.name} is invalid for batch execution.`,
      });
      return;
    }

    const client = clientFactory();
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

    const concurrency = clampConcurrency(body.config.concurrency);
    const startedAt = new Date().toISOString();
    const batchRun: BatchRunRecord = {
      id: body.config.id,
      name: body.config.name,
      status: 'running',
      product: body.product,
      groupIds: selectedGroups.map((group) => group.id),
      concurrency,
      createdAt: body.config.createdAt,
      startedAt,
      baselineResults: [],
      relayResults: [],
      failedGroups: [],
    };

    try {
      const analyst = await ensureAnalystSpark(client);
      streamBatchEvent(response, {
        type: 'system',
        text: `Starting batch run "${batchRun.name}" with ${selectedGroups.length} group(s) at concurrency ${concurrency}.`,
      });

      await runBatchPhase(response, 'baseline', selectedGroups, concurrency, async (group) => {
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        streamBatchEvent(response, {
          type: 'group_started',
          groupId: group.id,
          groupName: group.name,
          phase: 'baseline',
        });

        try {
          const discussion = await runGroupDiscussion({
            client,
            group,
            product: body.product,
            personas: body.personas,
            phase: 'baseline',
            signal: controller.signal,
            onMessage: (event) => {
              streamBatchEvent(response, {
                type: 'group_message',
                groupId: event.groupId,
                groupName: event.groupName,
                phase: event.phase,
                round: event.round,
                mindId: event.mindId,
                mindName: event.mindName,
                text: event.text,
              });
            },
          });

          const personasForGroup = group.personaIds
            .map((personaId) => body.personas.find((persona) => persona.id === personaId))
            .filter(Boolean) as Array<Pick<PersonaState, 'id' | 'name'>>;
          const analysis = await analyzeGroupTranscript(
            client,
            analyst,
            body.product,
            group,
            personasForGroup,
            discussion.transcript,
            'baseline',
            controller.signal,
          );

          const result: GroupPhaseResult = {
            groupId: group.id,
            groupName: group.name,
            phase: 'baseline',
            transcript: discussion.transcript,
            analysis,
            startedAt: discussion.startedAt,
            completedAt: discussion.completedAt,
            status: 'completed',
          };

          batchRun.baselineResults.push(result);
          streamBatchEvent(response, {
            type: 'group_analysis',
            groupId: group.id,
            groupName: group.name,
            phase: 'baseline',
            analysis,
          });
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) {
            throw error;
          }

          const failure = createFailure(group.id, group.name, 'baseline', normalizedMessage(error, 'Baseline group failed.'));
          batchRun.failedGroups.push(failure);
          streamBatchEvent(response, {
            type: 'error',
            groupId: group.id,
            groupName: group.name,
            phase: 'baseline',
            message: failure.message,
          });
        }
      });

      batchRun.baselineResults = batchRun.groupIds
        .map((groupId) => batchRun.baselineResults.find((result) => result.groupId === groupId))
        .filter(Boolean) as GroupPhaseResult[];

      if (batchRun.baselineResults.length === 0) {
        batchRun.status = 'failed';
        batchRun.completedAt = new Date().toISOString();
        streamBatchEvent(response, {
          type: 'error',
          phase: 'baseline',
          message: 'All groups failed during the baseline phase.',
        });
        streamBatchEvent(response, {
          type: 'batch_completed',
          run: batchRun,
        });
        response.end();
        return;
      }

      streamBatchEvent(response, {
        type: 'batch_status',
        phase: 'consensus',
        completedGroups: 0,
        totalGroups: 1,
        activeGroups: 1,
      });

      try {
        batchRun.baselineConsensus = await buildBaselineConsensus(
          client,
          analyst,
          body.product,
          batchRun.baselineResults,
          batchRun.failedGroups,
          controller.signal,
        );
        streamBatchEvent(response, {
          type: 'consensus_ready',
          consensus: batchRun.baselineConsensus,
        });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw error;
        }

        batchRun.failedGroups.push(
          createFailure('__consensus__', 'Global Consensus', 'consensus', normalizedMessage(error, 'Consensus synthesis failed.')),
        );
        batchRun.status = finalizeStatus(batchRun.baselineResults, batchRun.relayResults, batchRun.failedGroups);
        batchRun.completedAt = new Date().toISOString();
        streamBatchEvent(response, {
          type: 'error',
          phase: 'consensus',
          message: 'Consensus synthesis failed. Relay was skipped.',
        });
        streamBatchEvent(response, {
          type: 'batch_completed',
          run: batchRun,
        });
        response.end();
        return;
      }

      streamBatchEvent(response, {
        type: 'batch_status',
        phase: 'consensus',
        completedGroups: 1,
        totalGroups: 1,
        activeGroups: 0,
      });

      const baselineByGroupId = groupResultsById(batchRun.baselineResults);
      const relayGroups = selectedGroups.filter((group) => baselineByGroupId.has(group.id));

      await runBatchPhase(response, 'relay', relayGroups, concurrency, async (group) => {
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const baselineResult = baselineByGroupId.get(group.id);
        if (!baselineResult || !batchRun.baselineConsensus) {
          return;
        }

        streamBatchEvent(response, {
          type: 'group_started',
          groupId: group.id,
          groupName: group.name,
          phase: 'relay',
        });

        try {
          const discussion = await runGroupDiscussion({
            client,
            group,
            product: body.product,
            personas: body.personas,
            phase: 'relay',
            baselineSummary: baselineResult.analysis.summary,
            consensusSummary: batchRun.baselineConsensus,
            signal: controller.signal,
            onMessage: (event) => {
              streamBatchEvent(response, {
                type: 'group_message',
                groupId: event.groupId,
                groupName: event.groupName,
                phase: event.phase,
                round: event.round,
                mindId: event.mindId,
                mindName: event.mindName,
                text: event.text,
              });
            },
          });

          const personasForGroup = group.personaIds
            .map((personaId) => body.personas.find((persona) => persona.id === personaId))
            .filter(Boolean) as Array<Pick<PersonaState, 'id' | 'name'>>;
          const analysis = await analyzeGroupTranscript(
            client,
            analyst,
            body.product,
            group,
            personasForGroup,
            discussion.transcript,
            'relay',
            controller.signal,
          );

          const result: GroupPhaseResult = {
            groupId: group.id,
            groupName: group.name,
            phase: 'relay',
            transcript: discussion.transcript,
            analysis,
            startedAt: discussion.startedAt,
            completedAt: discussion.completedAt,
            status: 'completed',
          };

          batchRun.relayResults.push(result);
          streamBatchEvent(response, {
            type: 'group_analysis',
            groupId: group.id,
            groupName: group.name,
            phase: 'relay',
            analysis,
          });
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) {
            throw error;
          }

          const failure = createFailure(group.id, group.name, 'relay', normalizedMessage(error, 'Relay group failed.'));
          batchRun.failedGroups.push(failure);
          streamBatchEvent(response, {
            type: 'error',
            groupId: group.id,
            groupName: group.name,
            phase: 'relay',
            message: failure.message,
          });
        }
      });

      batchRun.relayResults = batchRun.groupIds
        .map((groupId) => batchRun.relayResults.find((result) => result.groupId === groupId))
        .filter(Boolean) as GroupPhaseResult[];

      if (batchRun.relayResults.length === 0) {
        batchRun.failedGroups.push(
          createFailure('__aggregate__', 'Batch Aggregate', 'aggregate', 'All relay groups failed. Aggregate was skipped.'),
        );
        batchRun.status = finalizeStatus(batchRun.baselineResults, batchRun.relayResults, batchRun.failedGroups);
        batchRun.completedAt = new Date().toISOString();
        streamBatchEvent(response, {
          type: 'error',
          phase: 'aggregate',
          message: 'All relay groups failed. Aggregate was skipped.',
        });
        streamBatchEvent(response, {
          type: 'batch_completed',
          run: batchRun,
        });
        response.end();
        return;
      }

      streamBatchEvent(response, {
        type: 'batch_status',
        phase: 'aggregate',
        completedGroups: 0,
        totalGroups: 1,
        activeGroups: 1,
      });

      try {
        batchRun.finalAggregate = await buildFinalBatchAggregate(
          client,
          analyst,
          body.product,
          batchRun.baselineConsensus!,
          batchRun.relayResults,
          batchRun.failedGroups,
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw error;
        }

        batchRun.failedGroups.push(
          createFailure('__aggregate__', 'Batch Aggregate', 'aggregate', normalizedMessage(error, 'Final aggregate synthesis failed.')),
        );
        streamBatchEvent(response, {
          type: 'error',
          phase: 'aggregate',
          message: 'Final aggregate synthesis failed.',
        });
      }

      streamBatchEvent(response, {
        type: 'batch_status',
        phase: 'aggregate',
        completedGroups: 1,
        totalGroups: 1,
        activeGroups: 0,
      });

      batchRun.status = finalizeStatus(batchRun.baselineResults, batchRun.relayResults, batchRun.failedGroups);
      batchRun.completedAt = new Date().toISOString();
      streamBatchEvent(response, {
        type: 'batch_status',
        phase: 'complete',
        completedGroups: selectedGroups.length,
        totalGroups: selectedGroups.length,
        activeGroups: 0,
      });
      streamBatchEvent(response, {
        type: 'batch_completed',
        run: batchRun,
      });
      response.end();
    } catch (error) {
      batchRun.status = controller.signal.aborted || isAbortError(error) ? 'aborted' : 'failed';
      batchRun.completedAt = new Date().toISOString();
      streamBatchEvent(response, {
        type: 'error',
        phase: 'aggregate',
        message:
          batchRun.status === 'aborted'
            ? 'Batch run aborted.'
            : normalizedMessage(error, 'Batch run failed.'),
      });
      streamBatchEvent(response, {
        type: 'batch_completed',
        run: batchRun,
      });
      response.end();
    }
  };
}

export function createSimulationsRouter(options: SimulationsRouterOptions = {}) {
  const clientFactory = options.clientFactory ?? (() => new MindsClient());
  const getConfigValue = options.getConfig ?? getServerConfig;
  const router = Router();

  const groupRunHandler = createGroupRunHandler(clientFactory, getConfigValue);
  router.post('/group-run', groupRunHandler);
  router.post('/panel-run', groupRunHandler);

  router.post('/batch-run', createBatchRunHandler(clientFactory, getConfigValue));

  router.post('/analyze', async (request, response) => {
    const config = getConfigValue();
    if (!config.configured) {
      response.status(503).json({ message: 'MINDS_API_KEY is not configured on the server.' });
      return;
    }

    const body = request.body as AnalyzeRequest;
    if (!body?.product || !body?.personas || !body?.transcript) {
      response.status(400).json({ message: 'product, personas, and transcript are required.' });
      return;
    }

    const client = clientFactory();

    try {
      const analyst = await ensureAnalystSpark(client, body.analystSpark);
      const analysis = await analyzeGroupTranscript(
        client,
        analyst,
        body.product,
        syntheticGroupForAnalysis(body.personas),
        body.personas,
        [
          {
            id: 'single-run-transcript',
            senderId: 'system',
            senderName: 'TRANSCRIPT',
            text: body.transcript,
            createdAt: new Date().toISOString(),
            isSystem: true,
          },
        ],
        'baseline',
      );

      response.json({
        analyst,
        summary: analysis.summary,
        metrics: analysis.metrics,
        topAppeals: analysis.topAppeals,
        topObjections: analysis.topObjections,
        purchaseIntent: analysis.purchaseIntent,
      });
    } catch (error) {
      respondJsonError(error, response);
    }
  });

  return router;
}

export const simulationsRouter = createSimulationsRouter();
