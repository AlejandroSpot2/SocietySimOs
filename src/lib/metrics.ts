import type { BatchAggregateReport, GroupAnalysis, GroupMetric } from '../types';

export const SENTIMENT_MIN = -100;
export const SENTIMENT_MAX = 100;
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

const LEGACY_TEN_POINT_MAX = 10;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function looksLikeCollapsedTenPointScale(metrics: GroupMetric[]): boolean {
  return (
    metrics.length > 0 &&
    metrics.every(
      (metric) =>
        Number.isFinite(metric.sentiment) &&
        Number.isFinite(metric.persuasion) &&
        Number.isFinite(metric.passion) &&
        Math.abs(metric.sentiment) <= LEGACY_TEN_POINT_MAX &&
        metric.persuasion >= 0 &&
        metric.persuasion <= LEGACY_TEN_POINT_MAX &&
        metric.passion >= 0 &&
        metric.passion <= LEGACY_TEN_POINT_MAX,
    )
  );
}

export function normalizeGroupMetrics(metrics: GroupMetric[]): GroupMetric[] {
  const usesCollapsedTenPointScale = looksLikeCollapsedTenPointScale(metrics);
  const usesUnsignedTenPointSentiment =
    usesCollapsedTenPointScale &&
    metrics.every(
      (metric) => metric.sentiment >= 0 && metric.sentiment <= LEGACY_TEN_POINT_MAX,
    );

  return metrics.map((metric) => {
    const sentiment = usesCollapsedTenPointScale
      ? usesUnsignedTenPointSentiment
        ? (metric.sentiment - 5) * 20
        : metric.sentiment * 10
      : metric.sentiment;
    const persuasion = usesCollapsedTenPointScale ? metric.persuasion * 10 : metric.persuasion;
    const passion = usesCollapsedTenPointScale ? metric.passion * 10 : metric.passion;

    return {
      id: metric.id,
      sentiment: clampInt(sentiment, SENTIMENT_MIN, SENTIMENT_MAX),
      persuasion: clampInt(persuasion, SCORE_MIN, SCORE_MAX),
      passion: clampInt(passion, SCORE_MIN, SCORE_MAX),
    };
  });
}

export function normalizeGroupAnalysis(analysis: GroupAnalysis): GroupAnalysis {
  return {
    ...analysis,
    metrics: normalizeGroupMetrics(analysis.metrics),
  };
}

export function normalizeAggregateComparisons(
  comparisons: BatchAggregateReport['groupComparisons'],
): BatchAggregateReport['groupComparisons'] {
  const metrics = comparisons.map((comparison) => ({
    id: comparison.groupId,
    sentiment: comparison.averageSentiment,
    persuasion: comparison.averagePersuasion,
    passion: comparison.averagePassion,
  }));
  const normalized = normalizeGroupMetrics(metrics);
  const normalizedById = new Map(normalized.map((metric) => [metric.id, metric]));

  return comparisons.map((comparison) => {
    const metric = normalizedById.get(comparison.groupId);
    if (!metric) {
      return comparison;
    }

    return {
      ...comparison,
      averageSentiment: metric.sentiment,
      averagePersuasion: metric.persuasion,
      averagePassion: metric.passion,
    };
  });
}
