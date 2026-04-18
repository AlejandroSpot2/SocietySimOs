import type {
  BatchRunFailure,
  BatchRunRecord,
  BatchRunStatus,
  GlobalConsensusSummary,
  Group,
  GroupAnalysis,
  GroupMetric,
  GroupPhaseResult,
  Message,
  PersonaState,
  Product,
  RemoteSparkRef,
  VisualizationPhase,
  VisualizationSource,
} from '../types';
import { normalizeAggregateComparisons, normalizeGroupAnalysis, normalizeGroupMetrics } from './metrics';

const STORAGE_KEY = 'society-sim-os:state';
export const STORAGE_VERSION = 3;

interface BatchDraftState {
  selectedGroupIds: string[];
  concurrency: number;
}

export interface StoredAppState {
  version: number;
  products: Product[];
  personas: PersonaState[];
  groups: Group[];
  selectedProductId: string;
  selectedGroupId: string;
  selectedVisPersona: string | null;
  analystSpark: RemoteSparkRef | null;
  batchRuns: BatchRunRecord[];
  selectedBatchRunId: string | null;
  visualizationSource: VisualizationSource;
  selectedVisualizationPhase: VisualizationPhase;
  batchDraft: BatchDraftState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBatchRunStatus(value: unknown): value is BatchRunStatus {
  return (
    value === 'queued' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'completed_with_errors' ||
    value === 'aborted' ||
    value === 'failed'
  );
}

function isVisualizationSource(value: unknown): value is VisualizationSource {
  return value === 'single' || value === 'batch';
}

function isVisualizationPhase(value: unknown): value is VisualizationPhase {
  return value === 'baseline' || value === 'relay' || value === 'aggregate';
}

function sanitizeProducts(products: unknown, fallback: Product[]): Product[] {
  if (!Array.isArray(products)) {
    return fallback;
  }

  return products
    .filter(isRecord)
    .map((product) => ({
      id: String(product.id ?? ''),
      name: String(product.name ?? ''),
      category: String(product.category ?? ''),
      description: String(product.description ?? ''),
    }))
    .filter((product) => product.id);
}

function sanitizeRemoteSpark(value: unknown): RemoteSparkRef | undefined {
  if (!isRecord(value) || !value.sparkId || !value.fingerprint || !value.lastSyncedAt) {
    return undefined;
  }

  return {
    sparkId: String(value.sparkId),
    fingerprint: String(value.fingerprint),
    lastSyncedAt: String(value.lastSyncedAt),
  };
}

function sanitizePersonas(personas: unknown, fallback: PersonaState[]): PersonaState[] {
  if (!Array.isArray(personas)) {
    return fallback;
  }

  return personas
    .filter(isRecord)
    .map((persona) => ({
      id: String(persona.id ?? ''),
      name: String(persona.name ?? ''),
      prompt: String(persona.prompt ?? ''),
      discipline: persona.discipline ? String(persona.discipline) : undefined,
      description: persona.description ? String(persona.description) : undefined,
      tags: Array.isArray(persona.tags) ? persona.tags.map((tag) => String(tag)) : undefined,
      remote: sanitizeRemoteSpark(persona.remote),
    }))
    .filter((persona) => persona.id && persona.name && persona.prompt);
}

function sanitizeMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(isRecord)
    .map((message) => ({
      id: String(message.id ?? ''),
      senderId: String(message.senderId ?? ''),
      senderName: String(message.senderName ?? ''),
      text: String(message.text ?? ''),
      createdAt: String(message.createdAt ?? ''),
      isSystem: Boolean(message.isSystem),
    }))
    .filter((message) => message.id && message.senderId && message.senderName && message.createdAt);
}

function sanitizeGroupMetrics(metrics: unknown): GroupMetric[] {
  if (!Array.isArray(metrics)) {
    return [];
  }

  return normalizeGroupMetrics(
    metrics
      .filter(isRecord)
      .map((metric) => ({
        id: String(metric.id ?? ''),
        sentiment: Number(metric.sentiment ?? 0),
        persuasion: Number(metric.persuasion ?? 0),
        passion: Number(metric.passion ?? 0),
      }))
      .filter((metric) => metric.id),
  );
}

function sanitizeGroupAnalysis(value: unknown): GroupAnalysis | undefined {
  if (!isRecord(value) || typeof value.summary !== 'string') {
    return undefined;
  }

  const purchaseIntent =
    value.purchaseIntent === 'high' || value.purchaseIntent === 'mixed' || value.purchaseIntent === 'low'
      ? value.purchaseIntent
      : 'mixed';

  return normalizeGroupAnalysis({
    summary: value.summary,
    metrics: sanitizeGroupMetrics(value.metrics),
    topAppeals: Array.isArray(value.topAppeals) ? value.topAppeals.map((item) => String(item)) : [],
    topObjections: Array.isArray(value.topObjections)
      ? value.topObjections.map((item) => String(item))
      : [],
    purchaseIntent,
  });
}

function sanitizeGroupPhaseResults(value: unknown): GroupPhaseResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const results: GroupPhaseResult[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const analysis = sanitizeGroupAnalysis(item.analysis);
    if (!analysis) {
      continue;
    }

    const groupId = String(item.groupId ?? '');
    const groupName = String(item.groupName ?? '');
    if (!groupId || !groupName) {
      continue;
    }

    results.push({
      groupId,
      groupName,
      phase: item.phase === 'relay' ? 'relay' : 'baseline',
      transcript: sanitizeMessages(item.transcript),
      analysis,
      startedAt: String(item.startedAt ?? ''),
      completedAt: String(item.completedAt ?? ''),
      status: item.status === 'failed' ? 'failed' : 'completed',
      errorMessage: item.errorMessage ? String(item.errorMessage) : undefined,
    });
  }

  return results;
}

function sanitizeConsensus(value: unknown): GlobalConsensusSummary | undefined {
  if (!isRecord(value) || typeof value.executiveSummary !== 'string') {
    return undefined;
  }

  return {
    executiveSummary: value.executiveSummary,
    topAppeals: Array.isArray(value.topAppeals) ? value.topAppeals.map((item) => String(item)) : [],
    topObjections: Array.isArray(value.topObjections) ? value.topObjections.map((item) => String(item)) : [],
    polarizingPoints: Array.isArray(value.polarizingPoints)
      ? value.polarizingPoints.map((item) => String(item))
      : [],
    followupQuestions: Array.isArray(value.followupQuestions)
      ? value.followupQuestions.map((item) => String(item))
      : [],
  };
}

function sanitizeFailures(value: unknown): BatchRunFailure[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const failures: BatchRunFailure[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const groupId = String(item.groupId ?? '');
    const groupName = String(item.groupName ?? '');
    const message = String(item.message ?? '');
    if (!groupId || !groupName || !message) {
      continue;
    }

    const phase: BatchRunFailure['phase'] =
      item.phase === 'consensus' || item.phase === 'relay' || item.phase === 'aggregate'
        ? item.phase
        : 'baseline';

    failures.push({
      groupId,
      groupName,
      phase,
      message,
    });
  }

  return failures;
}

function sanitizeAggregate(value: unknown): BatchRunRecord['finalAggregate'] {
  if (!isRecord(value) || typeof value.summary !== 'string') {
    return undefined;
  }

  const averagePersonaMetrics = sanitizeGroupMetrics(value.averagePersonaMetrics);
  const groupComparisons: NonNullable<BatchRunRecord['finalAggregate']>['groupComparisons'] = [];

  if (Array.isArray(value.groupComparisons)) {
    for (const item of value.groupComparisons) {
      if (!isRecord(item)) {
        continue;
      }

      const groupId = String(item.groupId ?? '');
      const groupName = String(item.groupName ?? '');
      if (!groupId || !groupName) {
        continue;
      }

      groupComparisons.push({
        groupId,
        groupName,
        averageSentiment: Number(item.averageSentiment ?? 0),
        averagePersuasion: Number(item.averagePersuasion ?? 0),
        averagePassion: Number(item.averagePassion ?? 0),
        purchaseIntent:
          item.purchaseIntent === 'high' || item.purchaseIntent === 'low' || item.purchaseIntent === 'mixed'
            ? item.purchaseIntent
            : 'mixed',
      });
    }
  }

  return {
    summary: value.summary,
    topAppeals: Array.isArray(value.topAppeals) ? value.topAppeals.map((item) => String(item)) : [],
    topObjections: Array.isArray(value.topObjections) ? value.topObjections.map((item) => String(item)) : [],
    consensusShifts: Array.isArray(value.consensusShifts)
      ? value.consensusShifts.map((item) => String(item))
      : [],
    failedGroups: Array.isArray(value.failedGroups) ? value.failedGroups.map((item) => String(item)) : [],
    averagePersonaMetrics,
    groupComparisons: normalizeAggregateComparisons(groupComparisons),
  };
}

function sanitizeBatchRuns(value: unknown, products: Product[]): BatchRunRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const runs: BatchRunRecord[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const product = sanitizeProducts([item.product], []).at(0) ?? products.at(0);
    const id = String(item.id ?? '');
    const name = String(item.name ?? '');
    const createdAt = String(item.createdAt ?? '');
    const startedAt = String(item.startedAt ?? '');

    if (!product || !id || !name || !createdAt || !startedAt) {
      continue;
    }

    runs.push({
      id,
      name,
      status: isBatchRunStatus(item.status) ? item.status : 'failed',
      product,
      groupIds: Array.isArray(item.groupIds) ? item.groupIds.map((groupId) => String(groupId)).filter(Boolean) : [],
      concurrency: Number(item.concurrency ?? 4),
      createdAt,
      startedAt,
      completedAt: item.completedAt ? String(item.completedAt) : undefined,
      baselineResults: sanitizeGroupPhaseResults(item.baselineResults),
      relayResults: sanitizeGroupPhaseResults(item.relayResults),
      baselineConsensus: sanitizeConsensus(item.baselineConsensus),
      finalAggregate: sanitizeAggregate(item.finalAggregate),
      failedGroups: sanitizeFailures(item.failedGroups),
    });
  }

  return runs;
}

function sanitizeBatchDraft(value: unknown): BatchDraftState {
  if (!isRecord(value)) {
    return {
      selectedGroupIds: [],
      concurrency: 4,
    };
  }

  return {
    selectedGroupIds: Array.isArray(value.selectedGroupIds)
      ? value.selectedGroupIds.map((item) => String(item)).filter(Boolean)
      : [],
    concurrency: Number.isFinite(Number(value.concurrency)) ? Number(value.concurrency) : 4,
  };
}

function sanitizeGroups(groups: unknown, fallback: Group[]): Group[] {
  if (!Array.isArray(groups)) {
    return fallback;
  }

  return groups
    .filter(isRecord)
    .map((group) => ({
      id: String(group.id ?? ''),
      name: String(group.name ?? ''),
      personaIds: Array.isArray(group.personaIds)
        ? group.personaIds.map((personaId) => String(personaId)).filter(Boolean)
        : [],
      remoteGroupId: group.remoteGroupId
        ? String(group.remoteGroupId)
        : group.remotePanelId
          ? String(group.remotePanelId)
          : undefined,
      remoteGroupFingerprint: group.remoteGroupFingerprint
        ? String(group.remoteGroupFingerprint)
        : group.remoteFingerprint
          ? String(group.remoteFingerprint)
          : undefined,
      lastSyncedAt: group.lastSyncedAt ? String(group.lastSyncedAt) : undefined,
    }))
    .filter((group) => group.id && group.name);
}

function migrateLegacyState(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version === 3) {
    return raw;
  }

  if (raw.version === 2) {
    const groups = Array.isArray(raw.groups)
      ? raw.groups.map((group) => {
          if (!isRecord(group)) {
            return group;
          }

          return {
            ...group,
            remoteGroupId: group.remoteGroupId ?? group.remotePanelId,
            remoteGroupFingerprint: group.remoteGroupFingerprint ?? group.remoteFingerprint,
          };
        })
      : raw.groups;

    return {
      ...raw,
      version: 3,
      groups,
      batchRuns: [],
      selectedBatchRunId: null,
      visualizationSource: 'single',
      selectedVisualizationPhase: 'baseline',
      batchDraft: {
        selectedGroupIds: [],
        concurrency: 4,
      },
    };
  }

  return raw;
}

export function loadAppState(fallback: StoredAppState): StoredAppState {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = migrateLegacyState(JSON.parse(raw) as Record<string, unknown>);
    if (parsed.version !== STORAGE_VERSION) {
      return fallback;
    }

    const products = sanitizeProducts(parsed.products, fallback.products);

    return {
      version: STORAGE_VERSION,
      products,
      personas: sanitizePersonas(parsed.personas, fallback.personas),
      groups: sanitizeGroups(parsed.groups, fallback.groups),
      selectedProductId:
        typeof parsed.selectedProductId === 'string'
          ? parsed.selectedProductId
          : fallback.selectedProductId,
      selectedGroupId:
        typeof parsed.selectedGroupId === 'string'
          ? parsed.selectedGroupId
          : fallback.selectedGroupId,
      selectedVisPersona:
        parsed.selectedVisPersona === null || typeof parsed.selectedVisPersona === 'string'
          ? (parsed.selectedVisPersona as string | null)
          : fallback.selectedVisPersona,
      analystSpark: sanitizeRemoteSpark(parsed.analystSpark) ?? fallback.analystSpark,
      batchRuns: sanitizeBatchRuns(parsed.batchRuns, products),
      selectedBatchRunId:
        parsed.selectedBatchRunId === null || typeof parsed.selectedBatchRunId === 'string'
          ? (parsed.selectedBatchRunId as string | null)
          : fallback.selectedBatchRunId,
      visualizationSource: isVisualizationSource(parsed.visualizationSource)
        ? parsed.visualizationSource
        : fallback.visualizationSource,
      selectedVisualizationPhase: isVisualizationPhase(parsed.selectedVisualizationPhase)
        ? parsed.selectedVisualizationPhase
        : fallback.selectedVisualizationPhase,
      batchDraft: sanitizeBatchDraft(parsed.batchDraft),
    };
  } catch {
    return fallback;
  }
}

export function saveAppState(state: StoredAppState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
