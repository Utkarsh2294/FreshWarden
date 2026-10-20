const months = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];
const yearValue = (year) =>
  +year < 100 ? (+year <= 69 ? 2000 : 1900) + +year : +year;
function result(year, month, day, precision = 'day') {
  const y = yearValue(year),
    m = +month,
    d = day == null ? new Date(Date.UTC(y, m, 0)).getUTCDate() : +day;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    y < 1970 ||
    y > 2200 ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    return { iso: null, precision: null, confidence: 0 };
  return {
    iso: date.toISOString().slice(0, 10),
    precision,
    confidence: precision === 'day' ? 0.95 : 0.8,
  };
}
export function parseLabelDate(text, { mfgDate } = {}) {
  const value = String(text || '')
    .trim()
    .toUpperCase();
  let match = value.match(
    /(?:BB|BEST BEFORE)\s*(\d{1,2})\s*MONTHS?\s*FROM\s*(?:MFG|MANUFACTURE)/,
  );
  if (match) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mfgDate || ''))
      return { iso: null, precision: null, confidence: 0 };
    const [y, m, d] = mfgDate.split('-').map(Number),
      target = new Date(Date.UTC(y, m - 1 + +match[1], 1));
    const finalDay = Math.min(
      d,
      new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    );
    return result(target.getUTCFullYear(), target.getUTCMonth() + 1, finalDay);
  }
  match = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (match) return result(match[1], match[2], match[3]);
  match = value.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (match) return result(match[3], match[2], match[1]);
  match = value.match(/\b(?:(\d{1,2})\s+)?([A-Z]{3,9})\s+(\d{4})\b/);
  if (match) {
    const m = months.indexOf(match[2].slice(0, 3)) + 1;
    if (m) return result(match[3], m, match[1], match[1] ? 'day' : 'month');
  }
  match = value.match(/\b(\d{1,2})\/(\d{4}|\d{2})\b/);
  if (match) return result(match[2], match[1], null, 'month');
  match = value.match(/\b(\d{4})-(\d{2})\b/);
  if (match) return result(match[1], match[2], null, 'month');
  return { iso: null, precision: null, confidence: 0 };
}
