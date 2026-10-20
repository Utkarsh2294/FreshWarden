import { describe, it, expect } from '@jest/globals';
import {
  evaluateShelfLife,
  DAY,
  labelInstant,
} from '../src/rules/shelfLife.js';
import { parseLabelDate } from '../src/rules/parseLabelDate.js';
import { sortFefo } from '../src/rules/fefo.js';
import {
  thermalDebitDays,
  detectExcursions,
} from '../src/rules/temperature.js';
const now = new Date('2026-10-20T12:00:00Z');
const date = (days) => new Date(+now + days * DAY);
describe('shelf-life decisions', () => {
  it.each([
    [30, -70, 'amber'],
    [29.9, -70.1, 'red'],
    [45, -155, 'amber'],
    [44, -156, 'red'],
    [70, -30, 'green'],
    [-1, -100, 'red'],
    [0, -100, 'red'],
    [1, -1, 'green'],
  ])('%s days remaining and mfg %s → %s', (remaining, mfg, status) =>
    expect(
      evaluateShelfLife({ now, mfgDate: date(mfg), expDate: date(remaining) })
        .status,
    ).toBe(status),
  );
  it('requires both configured criteria', () =>
    expect(
      evaluateShelfLife({
        now,
        mfgDate: date(-1),
        expDate: date(1),
        rule: { minPercent: 30, minDays: 45, mode: 'both', warnPercent: 40 },
      }).status,
    ).toBe('red'));
  it('accepts both criteria when satisfied', () =>
    expect(
      evaluateShelfLife({
        now,
        mfgDate: date(-10),
        expDate: date(50),
        rule: { minPercent: 30, minDays: 45, mode: 'both', warnPercent: 40 },
      }).status,
    ).toBe('green'));
  it.each([undefined, null, '', 'nonsense'])(
    'unreadable expiry %s is amber',
    (expDate) =>
      expect(evaluateShelfLife({ now, expDate }).status).toBe('amber'),
  );
  it('unknown mfg at 45 days stays amber', () =>
    expect(evaluateShelfLife({ now, expDate: date(45) }).reasons).toContain(
      'MFG_UNKNOWN_PERCENT_NOT_CHECKED',
    ));
  it('unknown mfg under day threshold is red', () =>
    expect(evaluateShelfLife({ now, expDate: date(44) }).status).toBe('red'));
  it.each([100, 30])('future or invalid chronology is amber %s', (mfg) =>
    expect(
      evaluateShelfLife({ now, expDate: date(30), mfgDate: date(mfg) }).status,
    ).toBe('amber'),
  );
  it('rejects malformed mfg as uncertain', () =>
    expect(
      evaluateShelfLife({ now, expDate: date(50), mfgDate: 'oops' }).status,
    ).toBe('amber'));
  it('fails closed on invalid clock', () =>
    expect(
      evaluateShelfLife({ now: 'oops', expDate: date(50) }).reasons,
    ).toContain('INVALID_CLOCK'));
  it('Indian date-only expiry lasts through local day', () =>
    expect(labelInstant('2026-10-20', true)).toBe(
      Date.parse('2026-10-20T18:30:00Z'),
    ));
  it('Indian date-only mfg starts local day', () =>
    expect(labelInstant('2026-10-20')).toBe(
      Date.parse('2026-10-19T18:30:00Z'),
    ));
});
describe('Indian printed label dates', () => {
  it.each([
    ['12/12/2026', '2026-12-12'],
    ['12-12-26', '2026-12-12'],
    ['12.12.2026', '2026-12-12'],
    ['12 DEC 2026', '2026-12-12'],
    ['DECEMBER 2026', '2026-12-31'],
    ['12/2026', '2026-12-31'],
    ['EXP: 12/26', '2026-12-31'],
    ['29/02/2028', '2028-02-29'],
    ['03/04/05', '2005-04-03'],
    ['01/01/69', '2069-01-01'],
    ['01/01/70', '1970-01-01'],
    ['2026-12-12', '2026-12-12'],
    ['2028-02', '2028-02-29'],
    ['02/2027', '2027-02-28'],
    ['31/02/2026', null],
    ['29/02/2027', null],
    ['00/12/2026', null],
    ['13/2026', null],
    ['n/a', null],
    ['2026-13-01', null],
    ['01/XYZ/2026', null],
    ['01/01/1900', null],
    ['01/01/2300', null],
  ])('%s → %s', (text, iso) => expect(parseLabelDate(text).iso).toBe(iso));
  it('requires mfg for relative dates', () =>
    expect(parseLabelDate('BB 6 MONTHS FROM MFG').iso).toBeNull());
  it('clamps month-end relative dates', () =>
    expect(
      parseLabelDate('BB 1 MONTH FROM MFG', { mfgDate: '2026-01-31' }).iso,
    ).toBe('2026-02-28'));
  it('calculates six months', () =>
    expect(
      parseLabelDate('BEST BEFORE 6 MONTHS FROM MANUFACTURE', {
        mfgDate: '2026-04-20',
      }).iso,
    ).toBe('2026-10-20'));
});
const readings = (minutes, tempC = 15, step = 1) =>
  Array.from({ length: Math.floor(minutes / step) + 1 }, (_, i) => ({
    ts: new Date(+now + i * step * 60000),
    tempC,
  }));
describe('thermal exposure', () => {
  it('calculates one hour at Q10 double rate', () =>
    expect(thermalDebitDays({ readings: readings(60), refC: 5 })).toBeCloseTo(
      1 / 24,
    ));
  it('no debit below reference', () =>
    expect(thermalDebitDays({ readings: readings(60, 4), refC: 5 })).toBe(0));
  it('does not interpolate sensor gaps', () =>
    expect(thermalDebitDays({ readings: readings(60, 15, 60), refC: 5 })).toBe(
      0,
    ));
  it('empty readings', () =>
    expect(thermalDebitDays({ readings: [], refC: 5 })).toBe(0));
  it('filters invalid readings', () =>
    expect(
      thermalDebitDays({ readings: [{ ts: 'bad', tempC: 12 }], refC: 5 }),
    ).toBe(0));
  it('9 minutes does not open', () =>
    expect(
      detectExcursions({ readings: readings(9), limits: { minC: 0, maxC: 5 } }),
    ).toHaveLength(0));
  it('11 minutes opens once', () =>
    expect(
      detectExcursions({
        readings: readings(11),
        limits: { minC: 0, maxC: 5 },
      }),
    ).toHaveLength(1));
  it('20 second door spike ignored', () =>
    expect(
      detectExcursions({
        readings: [
          { ts: now, tempC: 12, doorOpen: true },
          { ts: new Date(+now + 20000), tempC: 4 },
        ],
        limits: { minC: 0, maxC: 5 },
      }),
    ).toHaveLength(0));
  it('large gap resets sustained exposure', () =>
    expect(
      detectExcursions({
        readings: readings(11, 12, 11),
        limits: { minC: 0, maxC: 5 },
      }),
    ).toHaveLength(0));
  it('cold excursion also opens', () =>
    expect(
      detectExcursions({
        readings: readings(11, -5),
        limits: { minC: 0, maxC: 5 },
      }),
    ).toHaveLength(1));
});
describe('FEFO', () => {
  it('sorts effective expiry without mutation', () => {
    const lots = [
      { _id: 'b', expDate: date(2) },
      { _id: 'a', effectiveExpDate: date(1), expDate: date(3) },
    ];
    expect(sortFefo(lots)[0]._id).toBe('a');
    expect(lots[0]._id).toBe('b');
  });
  it('missing or invalid expiry sorts last', () =>
    expect(
      sortFefo([
        { _id: 'b', expDate: 'bad' },
        { _id: 'a', expDate: date(2) },
      ])[0]._id,
    ).toBe('a'));
  it('breaks equal expiry by creation time', () =>
    expect(
      sortFefo([
        { _id: 'b', expDate: date(2), createdAt: date(-1) },
        { _id: 'a', expDate: date(2), createdAt: date(-2) },
      ])[0]._id,
    ).toBe('a'));
  it('stable id tie break', () =>
    expect(sortFefo([{ _id: 'b' }, { _id: 'a' }])[0]._id).toBe('a'));
});
