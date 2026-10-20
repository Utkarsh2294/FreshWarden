export const DAY = 86400000;
export const DEFAULT_RULE = {
  minPercent: 30,
  minDays: 45,
  mode: 'either',
  warnPercent: 40,
};
// Date-only expiry labels are valid through the end of that date in India.
export function labelInstant(value, end = false) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return Date.parse(`${value}T00:00:00+05:30`) + (end ? DAY : 0);
  return value == null ? NaN : new Date(value).getTime();
}
export function evaluateShelfLife({
  mfgDate,
  expDate,
  now = new Date(),
  rule = DEFAULT_RULE,
}) {
  const base = { remainingPct: null, remainingDays: null };
  if (!expDate || !Number.isFinite(labelInstant(expDate, true)))
    return { ...base, status: 'amber', reasons: ['EXPIRY_NOT_READ'] };
  const expiry = labelInstant(expDate, true),
    current = new Date(now).getTime();
  if (!Number.isFinite(current))
    return { ...base, status: 'amber', reasons: ['INVALID_CLOCK'] };
  const remainingDays = (expiry - current) / DAY;
  if (remainingDays <= 0)
    return {
      status: 'red',
      reasons: ['EXPIRED'],
      remainingPct: 0,
      remainingDays,
    };
  const mfg = labelInstant(mfgDate),
    total = (expiry - mfg) / DAY;
  if (mfgDate && (!Number.isFinite(mfg) || total <= 0 || mfg > current))
    return {
      ...base,
      remainingDays,
      status: 'amber',
      reasons: ['MFG_AFTER_EXP_CHECK_LABEL'],
    };
  const remainingPct = mfgDate
    ? Math.min(100, (remainingDays / total) * 100)
    : null;
  const passPct = remainingPct !== null && remainingPct >= rule.minPercent,
    passDays = remainingDays >= rule.minDays;
  const pass = rule.mode === 'both' ? passPct && passDays : passPct || passDays;
  const reasons =
    remainingPct === null ? ['MFG_UNKNOWN_PERCENT_NOT_CHECKED'] : [];
  if (!pass)
    return {
      status: 'red',
      reasons: [...reasons, 'BELOW_MIN_SHELF_LIFE'],
      remainingDays,
      remainingPct,
    };
  if (remainingPct !== null && remainingPct < rule.warnPercent)
    reasons.push('NEAR_THRESHOLD');
  return {
    status: reasons.length ? 'amber' : 'green',
    reasons,
    remainingDays,
    remainingPct,
  };
}
