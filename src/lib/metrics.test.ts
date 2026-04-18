import { describe, expect, it } from 'vitest';
import {
  normalizeAggregateComparisons,
  normalizeGroupAnalysis,
  normalizeGroupMetrics,
} from './metrics';

describe('metrics normalization', () => {
  it('remaps collapsed 0-10 metrics into canonical visualization ranges', () => {
    expect(
      normalizeGroupMetrics([
        { id: 'chad', sentiment: 6, persuasion: 6, passion: 7 },
        { id: 'susan', sentiment: 2, persuasion: 2, passion: 5 },
      ]),
    ).toEqual([
      { id: 'chad', sentiment: 20, persuasion: 60, passion: 70 },
      { id: 'susan', sentiment: -60, persuasion: 20, passion: 50 },
    ]);
  });

  it('clamps already-canonical metrics without changing their scale', () => {
    expect(
      normalizeGroupAnalysis({
        summary: 'Test summary',
        metrics: [
          { id: 'a', sentiment: 120, persuasion: 110, passion: -10 },
          { id: 'b', sentiment: -40, persuasion: 55, passion: 65 },
        ],
        topAppeals: [],
        topObjections: [],
        purchaseIntent: 'mixed',
      }),
    ).toMatchObject({
      metrics: [
        { id: 'a', sentiment: 100, persuasion: 100, passion: 0 },
        { id: 'b', sentiment: -40, persuasion: 55, passion: 65 },
      ],
    });
  });

  it('normalizes saved aggregate group comparisons from the same collapsed scale', () => {
    expect(
      normalizeAggregateComparisons([
        {
          groupId: 'g1',
          groupName: 'Core',
          averageSentiment: 2,
          averagePersuasion: 3,
          averagePassion: 5,
          purchaseIntent: 'low',
        },
        {
          groupId: 'g2',
          groupName: 'Prestige',
          averageSentiment: 7,
          averagePersuasion: 6,
          averagePassion: 8,
          purchaseIntent: 'mixed',
        },
      ]),
    ).toEqual([
      {
        groupId: 'g1',
        groupName: 'Core',
        averageSentiment: -60,
        averagePersuasion: 30,
        averagePassion: 50,
        purchaseIntent: 'low',
      },
      {
        groupId: 'g2',
        groupName: 'Prestige',
        averageSentiment: 40,
        averagePersuasion: 60,
        averagePassion: 80,
        purchaseIntent: 'mixed',
      },
    ]);
  });
});
