export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  icpKeyword?: string;
}

export interface RemoteSparkRef {
  sparkId: string;
  fingerprint: string;
  lastSyncedAt: string;
}

export interface PersonaState {
  id: string;
  name: string;
  prompt: string;
  color?: string;
  discipline?: string;
  description?: string;
  tags?: string[];
  remote?: RemoteSparkRef;
}

export interface Group {
  id: string;
  name: string;
  personaIds: string[];
  remoteGroupId?: string;
  remoteGroupFingerprint?: string;
  lastSyncedAt?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  isSystem?: boolean;
}

export interface GroupMetric {
  id: string;
  sentiment: number;
  persuasion: number;
  passion: number;
}

export type Metric = GroupMetric;

export interface GroupAnalysis {
  summary: string;
  metrics: GroupMetric[];
  topAppeals: string[];
  topObjections: string[];
  purchaseIntent: 'low' | 'mixed' | 'high';
}

export type GroupRunPhase = 'baseline' | 'relay';
export type BatchRunStatus = 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'aborted' | 'failed';
export type VisualizationSource = 'single' | 'batch';
export type VisualizationPhase = 'baseline' | 'relay' | 'aggregate';

export interface GroupPhaseResult {
  groupId: string;
  groupName: string;
  phase: GroupRunPhase;
  transcript: Message[];
  analysis: GroupAnalysis;
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'failed';
  errorMessage?: string;
}

export interface GlobalConsensusSummary {
  executiveSummary: string;
  topAppeals: string[];
  topObjections: string[];
  polarizingPoints: string[];
  followupQuestions: string[];
}

export interface BatchAggregateReport {
  summary: string;
  topAppeals: string[];
  topObjections: string[];
  consensusShifts: string[];
  failedGroups: string[];
  averagePersonaMetrics: GroupMetric[];
  groupComparisons: Array<{
    groupId: string;
    groupName: string;
    averageSentiment: number;
    averagePersuasion: number;
    averagePassion: number;
    purchaseIntent: 'low' | 'mixed' | 'high';
  }>;
}

export interface BatchRunConfig {
  id: string;
  name: string;
  productId: string;
  groupIds: string[];
  concurrency: number;
  relayMode: 'global_consensus';
  createdAt: string;
}

export interface BatchRunFailure {
  groupId: string;
  groupName: string;
  phase: 'baseline' | 'consensus' | 'relay' | 'aggregate';
  message: string;
}

export interface BatchRunRecord {
  id: string;
  name: string;
  status: BatchRunStatus;
  product: Product;
  groupIds: string[];
  concurrency: number;
  createdAt: string;
  startedAt: string;
  completedAt?: string;
  baselineResults: GroupPhaseResult[];
  relayResults: GroupPhaseResult[];
  baselineConsensus?: GlobalConsensusSummary;
  finalAggregate?: BatchAggregateReport;
  failedGroups: BatchRunFailure[];
}

export interface GroupRunStreamEvent {
  type: 'system' | 'mind_message' | 'complete' | 'error';
  mindId?: string;
  mindName?: string;
  text?: string;
  raw?: unknown;
}

export type PanelStreamEvent = GroupRunStreamEvent;

export type BatchRunStreamEvent =
  | { type: 'system'; text: string }
  | {
      type: 'batch_status';
      phase: 'baseline' | 'consensus' | 'relay' | 'aggregate' | 'complete';
      completedGroups: number;
      totalGroups: number;
      activeGroups: number;
    }
  | { type: 'group_started'; groupId: string; groupName: string; phase: GroupRunPhase }
  | {
      type: 'group_message';
      groupId: string;
      groupName: string;
      phase: GroupRunPhase;
      round: number;
      mindId: string;
      mindName: string;
      text: string;
    }
  | { type: 'group_analysis'; groupId: string; groupName: string; phase: GroupRunPhase; analysis: GroupAnalysis }
  | { type: 'consensus_ready'; consensus: GlobalConsensusSummary }
  | { type: 'batch_completed'; run: BatchRunRecord }
  | {
      type: 'error';
      groupId?: string;
      groupName?: string;
      phase?: 'baseline' | 'consensus' | 'relay' | 'aggregate';
      message: string;
    };

export interface HealthResponse {
  ok: boolean;
  configured: boolean;
  provider: string;
  apiBaseUrl: string;
  maxPanelMinds: number;
  message?: string;
}
