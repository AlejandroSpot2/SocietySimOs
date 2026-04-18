import { createHash } from 'node:crypto';

export function hashFingerprint(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex');
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function deriveDiscipline(name: string): string {
  const match = name.match(/\(([^)]+)\)/);
  if (match?.[1]) {
    return match[1].trim();
  }

  const prefix = name.split(/[-,:]/)[0]?.trim();
  return prefix || 'Consumer Persona';
}

export function deriveTags(name: string): string[] {
  const base = name
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .map(slugify)
    .filter(Boolean);

  return Array.from(new Set(base)).slice(0, 8);
}

export function buildPersonaDescription(name: string, discipline: string): string {
  return `Synthetic focus-group persona for ${name} with discipline ${discipline}.`;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

export function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
