import type { CompetencyDefinition } from "./catalog";
import type { Forecast } from "./protocol";
import type { Learner } from "./schemas";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function calculateForecast(learner: Learner, curriculum: readonly CompetencyDefinition[]): Forecast {
  const progressById = new Map(learner.competencies.map((item) => [item.competencyId, item]));
  const totalLow = curriculum.reduce((sum, item) => sum + item.effortHours.low, 0);
  const totalHigh = curriculum.reduce((sum, item) => sum + item.effortHours.high, 0);
  const totalMidpoint = (totalLow + totalHigh) / 2;
  const completedMidpoint = curriculum.reduce((sum, definition) => {
    const midpoint = (definition.effortHours.low + definition.effortHours.high) / 2;
    return sum + midpoint * (progressById.get(definition.id)?.mastery ?? 0);
  }, 0);
  const mastery = totalMidpoint === 0 ? 0 : clamp(completedMidpoint / totalMidpoint, 0, 1);
  const activeHours = learner.activeMinutes / 60;
  const baselineLowRemaining = totalLow * (1 - mastery);
  const baselineHighRemaining = totalHigh * (1 - mastery);

  let estimatedLow = baselineLowRemaining;
  let estimatedHigh = baselineHighRemaining;
  const confidenceScore = clamp((activeHours / 80) * 0.5 + (mastery / 0.2) * 0.5, 0, 1);

  // Once there is enough evidence, blend the curriculum baseline with this learner's
  // demonstrated mastery velocity. Early forecasts intentionally remain broad.
  if (activeHours >= 5 && mastery >= 0.01 && mastery < 1) {
    const observedRemaining = Math.max(0, activeHours / mastery - activeHours);
    const baselineCenter = (baselineLowRemaining + baselineHighRemaining) / 2;
    const blendWeight = confidenceScore * 0.7;
    const center = baselineCenter * (1 - blendWeight) + observedRemaining * blendWeight;
    const spread = 0.35 - confidenceScore * 0.2;
    estimatedLow = center * (1 - spread);
    estimatedHigh = center * (1 + spread);
  }

  if (mastery === 1) {
    estimatedLow = 0;
    estimatedHigh = 0;
  }

  const confidence: Forecast["confidence"] = confidenceScore >= 0.7 ? "high" : confidenceScore >= 0.35 ? "medium" : "low";
  return {
    level: round(mastery * 100),
    masteryPercent: round(mastery * 100),
    activeHours: round(activeHours),
    estimatedRemainingHours: { low: round(estimatedLow), high: round(estimatedHigh) },
    estimatedCalendarWeeks: {
      low: round(estimatedLow / learner.weeklyHours),
      high: round(estimatedHigh / learner.weeklyHours),
    },
    confidence,
  };
}
