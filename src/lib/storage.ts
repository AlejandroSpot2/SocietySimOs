import type { Group, PersonaState, Product, RemoteSparkRef } from '../types';

const STORAGE_KEY = 'society-sim-os:state';
export const STORAGE_VERSION = 2;

export interface StoredAppState {
  version: number;
  products: Product[];
  personas: PersonaState[];
  groups: Group[];
  selectedProductId: string;
  selectedGroupId: string;
  selectedVisPersona: string | null;
  analystSpark: RemoteSparkRef | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
      remotePanelId: group.remotePanelId ? String(group.remotePanelId) : undefined,
      remoteFingerprint: group.remoteFingerprint ? String(group.remoteFingerprint) : undefined,
      lastSyncedAt: group.lastSyncedAt ? String(group.lastSyncedAt) : undefined,
    }))
    .filter((group) => group.id && group.name);
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

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== STORAGE_VERSION) {
      return fallback;
    }

    return {
      version: STORAGE_VERSION,
      products: sanitizeProducts(parsed.products, fallback.products),
      personas: sanitizePersonas(parsed.personas, fallback.personas),
      groups: sanitizeGroups(parsed.groups, fallback.groups),
      selectedProductId: typeof parsed.selectedProductId === 'string'
        ? parsed.selectedProductId
        : fallback.selectedProductId,
      selectedGroupId: typeof parsed.selectedGroupId === 'string'
        ? parsed.selectedGroupId
        : fallback.selectedGroupId,
      selectedVisPersona:
        parsed.selectedVisPersona === null || typeof parsed.selectedVisPersona === 'string'
          ? (parsed.selectedVisPersona as string | null)
          : fallback.selectedVisPersona,
      analystSpark: sanitizeRemoteSpark(parsed.analystSpark) ?? fallback.analystSpark,
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
