import { describe, expect, it } from 'vitest';
import type { Group, GroupPhaseResult, Product } from '../src/types';
import {
  averagePersonaMetrics,
  buildGroupComparisons,
  buildRemoteGroupFingerprint,
  clampConcurrency,
  runWithConcurrency,
} from './simulation-core';

const PRODUCT: Product = {
  id: 'product-1',
  name: 'GuanoGlow',
  category: 'Haircare',
  description: 'Test product',
};

function createResult(group: Group, metrics: GroupPhaseResult['analysis']['metrics']): GroupPhaseResult {
  return {
    groupId: group.id,
    groupName: group.name,
    phase: 'relay',
    transcript: [],
    analysis: {
      summary: `${group.name} summary`,
      metrics,
      topAppeals: ['appeal'],
      topObjections: ['objection'],
      purchaseIntent: 'mixed',
    },
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: 'completed',
  };
}

describe('simulation-core', () => {
  it('runWithConcurrency preserves input order and caps parallelism', async () => {
    let active = 0;
    let peak = 0;

    const result = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value % 2 === 0 ? 10 : 20));
      active -= 1;
      return value * 10;
    });

    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('buildRemoteGroupFingerprint is stable and sensitive to ordering', () => {
    const group: Group = { id: 'g1', name: 'Alpha', personaIds: ['p1', 'p2'] };

    const fingerprintA = buildRemoteGroupFingerprint(group, ['s1', 's2']);
    const fingerprintB = buildRemoteGroupFingerprint(group, ['s1', 's2']);
    const fingerprintC = buildRemoteGroupFingerprint(group, ['s2', 's1']);

    expect(fingerprintA).toBe(fingerprintB);
    expect(fingerprintA).not.toBe(fingerprintC);
  });

  it('clampConcurrency enforces min, max, and default values', () => {
    expect(clampConcurrency(undefined)).toBe(4);
    expect(clampConcurrency(0)).toBe(1);
    expect(clampConcurrency(99)).toBe(10);
    expect(clampConcurrency(6)).toBe(6);
  });

  it('averages persona metrics across successful group appearances', () => {
    const groupA: Group = { id: 'g1', name: 'Alpha', personaIds: ['p1', 'p2'] };
    const groupB: Group = { id: 'g2', name: 'Beta', personaIds: ['p1', 'p3'] };

    const averages = averagePersonaMetrics([
      createResult(groupA, [
        { id: 'p1', sentiment: 20, persuasion: 40, passion: 60 },
        { id: 'p2', sentiment: 10, persuasion: 30, passion: 50 },
      ]),
      createResult(groupB, [
        { id: 'p1', sentiment: 40, persuasion: 60, passion: 80 },
        { id: 'p3', sentiment: -10, persuasion: 20, passion: 30 },
      ]),
    ]);

    expect(averages).toEqual([
      { id: 'p1', sentiment: 30, persuasion: 50, passion: 70 },
      { id: 'p2', sentiment: 10, persuasion: 30, passion: 50 },
      { id: 'p3', sentiment: -10, persuasion: 20, passion: 30 },
    ]);
  });

  it('buildGroupComparisons computes per-group aggregate scores', () => {
    const groupA: Group = { id: 'g1', name: 'Alpha', personaIds: ['p1', 'p2'] };
    const comparisons = buildGroupComparisons([
      createResult(groupA, [
        { id: 'p1', sentiment: 10, persuasion: 50, passion: 70 },
        { id: 'p2', sentiment: 30, persuasion: 70, passion: 50 },
      ]),
    ]);

    expect(comparisons).toEqual([
      {
        groupId: 'g1',
        groupName: 'Alpha',
        averageSentiment: 20,
        averagePersuasion: 60,
        averagePassion: 60,
        purchaseIntent: 'mixed',
      },
    ]);
  });
});
