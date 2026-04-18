import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Group, PersonaState, Product } from '../src/types';
import type { MindsClientLike } from './minds-client';
import { createMindsRouter } from './routes/minds';
import { createSimulationsRouter } from './routes/simulations';

const PRODUCT: Product = {
  id: 'product-1',
  name: 'GuanoGlow',
  category: 'Haircare',
  description: 'Test product',
};

const PERSONAS: Array<Pick<PersonaState, 'id' | 'name' | 'remote'>> = [
  {
    id: 'p1',
    name: 'Chad',
    remote: {
      sparkId: 'spark-good',
      fingerprint: 'fp-1',
      lastSyncedAt: '2026-04-18T00:00:00.000Z',
    },
  },
  {
    id: 'p2',
    name: 'Susan',
    remote: {
      sparkId: 'spark-bad',
      fingerprint: 'fp-2',
      lastSyncedAt: '2026-04-18T00:00:00.000Z',
    },
  },
];

function createGroup(id: string, name: string, personaIds: string[]): Group {
  return { id, name, personaIds };
}

function createTestApp(path: '/api/minds' | '/api/simulations', router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(path, router);
  return app;
}

function parseSseEvents<T>(payload: string): T[] {
  return payload
    .split(/\r?\n\r?\n/)
    .map((chunk) => {
      const dataLines = chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      if (dataLines.length === 0) {
        return null;
      }

      return JSON.parse(dataLines.join('\n')) as T;
    })
    .filter(Boolean) as T[];
}

function createFakeClient(options?: {
  failSparkIds?: string[];
  failConsensus?: boolean;
  delayMs?: number;
}): MindsClientLike & {
  completeSparkMock: ReturnType<typeof vi.fn>;
  createGroupMock: ReturnType<typeof vi.fn>;
  updateSparkMock: ReturnType<typeof vi.fn>;
} {
  const analystId = 'analyst-1';

  const waitIfNeeded = async (signal?: AbortSignal) => {
    if (!options?.delayMs) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, options.delayMs);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  };

  const createMetricsFromPrompt = (prompt: string) => {
    const ids = Array.from(prompt.matchAll(/- ([^:]+):/g)).map((match) => match[1]);
    return ids.map((id, index) => ({
      id,
      sentiment: 20 + index * 10,
      persuasion: 50 + index * 5,
      passion: 60 + index * 3,
    }));
  };

  const createManualSparkMock = vi.fn(async (payload: { name: string }) => ({
    id: `spark-${payload.name}`,
    name: payload.name,
  }));
  const createAnalystSparkMock = vi.fn(async (payload: { name: string }) => ({
    id: analystId,
    name: payload.name,
  }));
  const updateSparkMock = vi.fn(async (sparkId: string) => ({ id: sparkId, name: sparkId }));
  const createGroupMock = vi.fn(async (name: string) => ({ id: `remote-${name}` }));
  const listSparksMock = vi.fn(async () => []);
  const completeSparkMock = vi.fn(
    async (sparkId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> => {
      await waitIfNeeded(signal);
      const prompt = String(((body.messages as Array<{ content?: string }> | undefined)?.[0]?.content ?? ''));

      if (sparkId !== analystId) {
        if (options?.failSparkIds?.includes(sparkId)) {
          throw new Error(`spark ${sparkId} failed`);
        }

        return {
          content: `${sparkId} response`,
        };
      }

      if (prompt.includes('Build a global consensus summary')) {
        if (options?.failConsensus) {
          throw new Error('consensus failed');
        }

        return {
          parsed: {
            executiveSummary: 'Consensus summary',
            topAppeals: ['Appeal A'],
            topObjections: ['Objection A'],
            polarizingPoints: ['Polarizing point'],
            followupQuestions: ['Follow-up'],
          },
        };
      }

      if (prompt.includes('Build a final aggregate report')) {
        return {
          parsed: {
            summary: 'Aggregate summary',
            topAppeals: ['Appeal A'],
            topObjections: ['Objection A'],
            consensusShifts: ['Shift A'],
            failedGroups: [],
          },
        };
      }

      return {
        parsed: {
          summary: 'Group analysis summary',
          metrics: createMetricsFromPrompt(prompt),
          topAppeals: ['Appeal A'],
          topObjections: ['Objection A'],
          purchaseIntent: 'mixed',
        },
      };
    },
  );

  const client: MindsClientLike & {
    completeSparkMock: ReturnType<typeof vi.fn>;
    createGroupMock: ReturnType<typeof vi.fn>;
    updateSparkMock: ReturnType<typeof vi.fn>;
  } = {
    createManualSpark: createManualSparkMock,
    createAnalystSpark: createAnalystSparkMock,
    updateSpark: updateSparkMock,
    createGroup: createGroupMock,
    listSparks: listSparksMock,
    completeSpark: ((sparkId, body, signal) => completeSparkMock(sparkId, body, signal)) as MindsClientLike['completeSpark'],
    completeSparkMock,
    createGroupMock,
    updateSparkMock,
  };

  return client;
}

describe('route behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('/api/minds/groups/sync rejects groups above 5 personas', async () => {
    const client = createFakeClient();
    const app = createTestApp(
      '/api/minds',
      createMindsRouter({
        clientFactory: () => client,
        getConfig: () => ({
          apiKey: 'test',
          apiBaseUrl: 'https://getminds.ai/api/v1',
          apifyApiKey: '',
          configured: true,
          maxPanelMinds: 5,
          port: 3000,
        }),
      }),
    );

    const response = await request(app).post('/api/minds/groups/sync').send({
      groups: [createGroup('g-over', 'Too Many', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])],
      personaRefs: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id, sparkId: `spark-${id}` })),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('exceeds');
    expect(client.createGroupMock).not.toHaveBeenCalled();
  });

  it('/api/minds/sparks/sync preserves explicit persona metadata', async () => {
    const client = createFakeClient();
    const app = createTestApp(
      '/api/minds',
      createMindsRouter({
        clientFactory: () => client,
        getConfig: () => ({
          apiKey: 'test',
          apiBaseUrl: 'https://getminds.ai/api/v1',
          apifyApiKey: '',
          configured: true,
          maxPanelMinds: 5,
          port: 3000,
        }),
      }),
    );

    const response = await request(app).post('/api/minds/sparks/sync').send({
      personas: [
        {
          id: 'persona-1',
          name: 'Nina Alvarez',
          prompt: 'You are Nina, a pragmatic RevOps lead who hates fake personalization.',
          discipline: 'Revenue Operations',
          description: 'Real ICP persona synthesized from community research.',
          tags: ['revops', 'pipeline', 'personalization'],
          remote: {
            sparkId: 'spark-nina',
            fingerprint: 'stale-fingerprint',
            lastSyncedAt: '2026-04-18T00:00:00.000Z',
          },
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(client.updateSparkMock).toHaveBeenCalledWith(
      'spark-nina',
      expect.objectContaining({
        discipline: 'Revenue Operations',
        description: 'Real ICP persona synthesized from community research.',
        tags: ['revops', 'pipeline', 'personalization'],
        prompt: 'You are Nina, a pragmatic RevOps lead who hates fake personalization.',
      }),
      'user',
    );
    expect(response.body.personas[0]).toEqual(
      expect.objectContaining({
        id: 'persona-1',
        discipline: 'Revenue Operations',
        description: 'Real ICP persona synthesized from community research.',
        tags: ['revops', 'pipeline', 'personalization'],
      }),
    );
  });

  it('/api/simulations/batch-run rejects missing remote sparks', async () => {
    const client = createFakeClient();
    const app = createTestApp(
      '/api/simulations',
      createSimulationsRouter({
        clientFactory: () => client,
        getConfig: () => ({
          apiKey: 'test',
          apiBaseUrl: 'https://getminds.ai/api/v1',
          apifyApiKey: '',
          configured: true,
          maxPanelMinds: 5,
          port: 3000,
        }),
      }),
    );

    const response = await request(app).post('/api/simulations/batch-run').send({
      config: {
        id: 'batch-1',
        name: 'Batch 1',
        productId: PRODUCT.id,
        groupIds: ['g1'],
        concurrency: 4,
        relayMode: 'global_consensus',
        createdAt: '2026-04-18T00:00:00.000Z',
      },
      product: PRODUCT,
      groups: [createGroup('g1', 'Alpha', ['p1'])],
      personas: [{ id: 'p1', name: 'Chad', remote: null }],
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('missing synced remote sparks');
  });

  it('batch-run clamps concurrency and continues after one baseline failure', async () => {
    const client = createFakeClient({ failSparkIds: ['spark-bad'] });
    const app = createTestApp(
      '/api/simulations',
      createSimulationsRouter({
        clientFactory: () => client,
        getConfig: () => ({
          apiKey: 'test',
          apiBaseUrl: 'https://getminds.ai/api/v1',
          apifyApiKey: '',
          configured: true,
          maxPanelMinds: 5,
          port: 3000,
        }),
      }),
    );

    const response = await request(app).post('/api/simulations/batch-run').send({
      config: {
        id: 'batch-2',
        name: 'Batch 2',
        productId: PRODUCT.id,
        groupIds: ['g1', 'g2'],
        concurrency: 99,
        relayMode: 'global_consensus',
        createdAt: '2026-04-18T00:00:00.000Z',
      },
      product: PRODUCT,
      groups: [createGroup('g1', 'Alpha', ['p1']), createGroup('g2', 'Beta', ['p2'])],
      personas: PERSONAS,
    });

    expect(response.status).toBe(200);
    const events = parseSseEvents<{ type: string; run?: { concurrency: number; status: string; baselineResults: unknown[]; relayResults: unknown[]; failedGroups: Array<{ groupId: string; phase: string }> } }>(response.text);
    const completed = events.find((event) => event.type === 'batch_completed');

    expect(completed?.run?.concurrency).toBe(10);
    expect(completed?.run?.status).toBe('completed_with_errors');
    expect(completed?.run?.baselineResults).toHaveLength(1);
    expect(completed?.run?.relayResults).toHaveLength(1);
    expect(completed?.run?.failedGroups).toEqual(
      expect.arrayContaining([expect.objectContaining({ groupId: 'g2', phase: 'baseline' })]),
    );
  });

  it('batch-run skips relay when consensus synthesis fails', async () => {
    const client = createFakeClient({ failConsensus: true });
    const app = createTestApp(
      '/api/simulations',
      createSimulationsRouter({
        clientFactory: () => client,
        getConfig: () => ({
          apiKey: 'test',
          apiBaseUrl: 'https://getminds.ai/api/v1',
          apifyApiKey: '',
          configured: true,
          maxPanelMinds: 5,
          port: 3000,
        }),
      }),
    );

    const response = await request(app).post('/api/simulations/batch-run').send({
      config: {
        id: 'batch-3',
        name: 'Batch 3',
        productId: PRODUCT.id,
        groupIds: ['g1'],
        concurrency: 4,
        relayMode: 'global_consensus',
        createdAt: '2026-04-18T00:00:00.000Z',
      },
      product: PRODUCT,
      groups: [createGroup('g1', 'Alpha', ['p1'])],
      personas: PERSONAS,
    });

    expect(response.status).toBe(200);
    const events = parseSseEvents<{ type: string; run?: { status: string; relayResults: unknown[]; failedGroups: Array<{ phase: string }> } }>(response.text);
    const completed = events.find((event) => event.type === 'batch_completed');

    expect(completed?.run?.status).toBe('completed_with_errors');
    expect(completed?.run?.relayResults).toHaveLength(0);
    expect(completed?.run?.failedGroups).toEqual(
      expect.arrayContaining([expect.objectContaining({ phase: 'consensus' })]),
    );
  });

  it('aborting a batch request stops inflight work', async () => {
    const client = createFakeClient({ delayMs: 120 });
    const app = createTestApp(
      '/api/simulations',
      createSimulationsRouter({
        clientFactory: () => client,
        getConfig: () => ({
          apiKey: 'test',
          apiBaseUrl: 'https://getminds.ai/api/v1',
          apifyApiKey: '',
          configured: true,
          maxPanelMinds: 5,
          port: 3000,
        }),
      }),
    );

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const controller = new AbortController();

    const fetchPromise = fetch(`http://127.0.0.1:${port}/api/simulations/batch-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        config: {
          id: 'batch-4',
          name: 'Batch 4',
          productId: PRODUCT.id,
          groupIds: ['g1'],
          concurrency: 1,
          relayMode: 'global_consensus',
          createdAt: '2026-04-18T00:00:00.000Z',
        },
        product: PRODUCT,
        groups: [createGroup('g1', 'Alpha', ['p1'])],
        personas: PERSONAS,
      }),
      signal: controller.signal,
    });

    setTimeout(() => controller.abort(), 20);
    await expect(fetchPromise).rejects.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(client.completeSparkMock.mock.calls.length).toBeLessThan(3);

    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
});
