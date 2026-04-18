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
  remotePanelId?: string;
  remoteFingerprint?: string;
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

export interface Metric {
  id: string;
  sentiment: number;
  persuasion: number;
  passion: number;
}

export interface PanelStreamEvent {
  type: 'system' | 'mind_message' | 'complete' | 'error';
  mindId?: string;
  mindName?: string;
  text?: string;
  raw?: unknown;
}

export interface HealthResponse {
  ok: boolean;
  configured: boolean;
  provider: string;
  apiBaseUrl: string;
  maxPanelMinds: number;
  message?: string;
}
