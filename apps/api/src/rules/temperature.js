import { DAY } from './shelfLife.js';
const ordered = (readings) =>
  [...readings]
    .filter((r) => Number.isFinite(+new Date(r.ts)) && Number.isFinite(r.tempC))
    .sort((a, b) => +new Date(a.ts) - +new Date(b.ts));
export function thermalDebitDays({
  readings,
  refC,
  q10 = 2,
  maxGapMinutes = 5,
}) {
  const data = ordered(readings);
  let debit = 0;
  for (let i = 1; i < data.length; i++) {
    const elapsed = +new Date(data[i].ts) - +new Date(data[i - 1].ts);
    // Missing sensor coverage is unknown, never interpolate hours of exposure.
    if (elapsed <= 0 || elapsed > maxGapMinutes * 60000) continue;
    if (data[i - 1].tempC > refC)
      debit += ((q10 ** ((data[i - 1].tempC - refC) / 10) - 1) * elapsed) / DAY;
  }
  return debit;
}
export function detectExcursions({
  readings,
  limits,
  minMinutes = 10,
  maxGapMinutes = 5,
}) {
  const data = ordered(readings),
    excursions = [];
  let start = null,
    peakC = -Infinity,
    last = null;
  for (const reading of data) {
    const time = +new Date(reading.ts),
      outside = reading.tempC < limits.minC || reading.tempC > limits.maxC;
    if (last !== null && time - last > maxGapMinutes * 60000) {
      start = null;
      peakC = -Infinity;
    }
    if (outside) {
      start ??= time;
      peakC = Math.max(peakC, reading.tempC);
      if (
        time - start >= minMinutes * 60000 &&
        !excursions.some((e) => e.startedAt === start)
      )
        excursions.push({
          startedAt: start,
          peakC,
          minutesOutside: (time - start) / 60000,
        });
    } else {
      start = null;
      peakC = -Infinity;
    }
    last = time;
  }
  return excursions;
}
