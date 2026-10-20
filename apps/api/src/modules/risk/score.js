import { evaluateShelfLife } from '../../rules/shelfLife.js';
export const RISK_WEIGHTS = {
  freshness: 40,
  thermal: 25,
  velocity: 20,
  hygiene: 10,
  label: 5,
};
export function scoreLot(
  lot,
  { weights = RISK_WEIGHTS, hygieneNorm = 0, now = new Date() } = {},
) {
  const life = evaluateShelfLife({
      mfgDate: lot.mfgDate,
      expDate: lot.effectiveExpDate,
      now,
    }),
    remainingPct = life.remainingPct;
  const factors = [
    [
      'Shelf life',
      weights.freshness *
        (1 - Math.max(0, Math.min(100, remainingPct ?? 0)) / 100),
    ],
    [
      'Estimated thermal exposure',
      weights.thermal *
        Math.min(
          1,
          (lot.thermalDebitDays || 0) / Math.max(1, life.remainingDays || 1),
        ),
    ],
    ['Low sales velocity', lot.velocityLow ? weights.velocity : 0],
    ['Visible hygiene findings', weights.hygiene * Math.min(1, hygieneNorm)],
    ['Unverified label evidence', lot.evidenceIds?.length ? 0 : weights.label],
  ].map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 }));
  return {
    score: Math.round(
      Math.max(
        0,
        Math.min(
          100,
          factors.reduce((sum, f) => sum + f.value, 0),
        ),
      ),
    ),
    factors: factors
      .filter((f) => f.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3),
    remainingDays: life.remainingDays,
    remainingPct,
    estimated: true,
    velocityAvailable: typeof lot.velocityLow === 'boolean',
  };
}
export function healthScore(
  {
    lotCount,
    acceptedCount,
    incidentSeverity = 0,
    excursionMinutes = 0,
    missedScans = 0,
    blocks = 0,
    coverageComplete = false,
  },
  params = {
    incidentPenalty: 2,
    excursionMinutePenalty: 0.2,
    missedScanPenalty: 5,
    blockPenalty: 1,
  },
) {
  if (!coverageComplete || !lotCount)
    return { score: null, status: 'insufficient_evidence' };
  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        (acceptedCount / lotCount) * 100 -
          incidentSeverity * params.incidentPenalty -
          excursionMinutes * params.excursionMinutePenalty -
          missedScans * params.missedScanPenalty -
          blocks * params.blockPenalty,
      ),
    ),
  );
  return {
    score,
    status: score >= 80 ? 'watchful' : score >= 50 ? 'attention' : 'critical',
  };
}
