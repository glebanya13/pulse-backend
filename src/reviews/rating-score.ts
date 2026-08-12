/**
 * Host rating weights (sum = 1.0). Overall is a weighted average of the
 * categories that were actually submitted, renormalized if some are missing.
 *
 * Tuned for trust portrait: taste + hospitality dominate; vibe stays rare spice.
 */
export const HOST_SCORE_WEIGHTS: Readonly<Record<string, number>> = {
  taste: 0.25,
  atmosphere: 0.18,
  hospitality: 0.2,
  sociability: 0.08,
  organization: 0.1,
  cleanliness: 0.1,
  matchesDescription: 0.04,
  vibe: 0.05,
};

export type ReviewTargetRoleLiteral = 'HOST' | 'GUEST';

/**
 * Compute the review overallScore 0–100.
 * HOST → weighted; GUEST (and unknown keys) → equal average of provided numbers.
 */
export function computeOverallScore(
  scores: Record<string, unknown>,
  targetRole: ReviewTargetRoleLiteral,
): number {
  const entries = Object.entries(scores).filter(
    (e): e is [string, number] =>
      typeof e[1] === 'number' && Number.isFinite(e[1]),
  );
  if (entries.length === 0) {
    throw new Error('At least one score category is required');
  }

  if (targetRole === 'HOST') {
    let weightedSum = 0;
    let weightTotal = 0;
    for (const [key, value] of entries) {
      const w = HOST_SCORE_WEIGHTS[key];
      if (w == null) continue;
      weightedSum += value * w;
      weightTotal += w;
    }
    if (weightTotal > 0) {
      return Math.round(weightedSum / weightTotal);
    }
  }

  const sum = entries.reduce((a, [, v]) => a + v, 0);
  return Math.round(sum / entries.length);
}
