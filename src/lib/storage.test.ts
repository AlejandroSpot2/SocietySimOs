import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppState, type StoredAppState } from './storage';

const fallbackState: StoredAppState = {
  version: 3,
  products: [
    {
      id: 'product-1',
      name: 'Fallback Product',
      category: 'Category',
      description: 'Description',
    },
  ],
  personas: [
    {
      id: 'persona-1',
      name: 'Fallback Persona',
      prompt: 'Prompt',
    },
  ],
  groups: [
    {
      id: 'group-1',
      name: 'Fallback Group',
      personaIds: ['persona-1'],
    },
  ],
  selectedProductId: 'product-1',
  selectedGroupId: 'group-1',
  selectedVisPersona: null,
  analystSpark: null,
  batchRuns: [],
  selectedBatchRunId: null,
  visualizationSource: 'single',
  selectedVisualizationPhase: 'baseline',
  batchDraft: {
    selectedGroupIds: ['group-1'],
    concurrency: 4,
  },
};

function stubWindow(payload: unknown) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn(() => JSON.stringify(payload)),
      setItem: vi.fn(),
    },
  });
}

describe('storage migration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('migrates version 2 state to version 3 with canonical remote group fields', () => {
    stubWindow({
      version: 2,
      products: fallbackState.products,
      personas: fallbackState.personas,
      groups: [
        {
          id: 'legacy-group',
          name: 'Legacy Group',
          personaIds: ['persona-1'],
          remotePanelId: 'remote-panel-123',
          remoteFingerprint: 'legacy-fingerprint',
          lastSyncedAt: '2026-04-18T00:00:00.000Z',
        },
      ],
      selectedProductId: 'product-1',
      selectedGroupId: 'legacy-group',
      selectedVisPersona: 'persona-1',
      analystSpark: null,
    });

    const state = loadAppState(fallbackState);

    expect(state.version).toBe(3);
    expect(state.groups[0]).toMatchObject({
      id: 'legacy-group',
      remoteGroupId: 'remote-panel-123',
      remoteGroupFingerprint: 'legacy-fingerprint',
    });
    expect(state.batchRuns).toEqual([]);
    expect(state.selectedBatchRunId).toBeNull();
    expect(state.visualizationSource).toBe('single');
    expect(state.selectedVisualizationPhase).toBe('baseline');
  });
});
