import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Sensor, Reading, Excursion } from './models.js';
import { Incident } from '../incidents/model.js';
import { Store, Lot, User } from '../../models/index.js';
import { fail } from '../../middleware/error.js';
import { getRule } from '../../rules/index.js';
import { detectExcursions, thermalDebitDays } from '../../rules/temperature.js';
import { evaluateShelfLife, DAY } from '../../rules/shelfLife.js';
import { emitStore } from '../../realtime.js';
export const readingInput = z
  .object({
    deviceId: z.string().regex(/^[a-zA-Z\d-]{1,60}$/),
    zoneId: z.string().min(1).max(40),
    tempC: z.number().finite().min(-40).max(80),
    humidity: z.number().min(0).max(100).optional(),
    doorOpen: z.boolean().optional(),
    ts: z.string().datetime().optional(),
  })
  .strict();
export const hashKey = (key) => createHash('sha256').update(key).digest('hex');
export async function ingest(
  payload,
  key,
  { allowHistorical = false, isDemo = false } = {},
) {
  const rows = z
    .array(readingInput)
    .min(1)
    .max(200)
    .parse(Array.isArray(payload) ? payload : [payload]);
  if (
    rows.some(
      (row) =>
        row.deviceId !== rows[0].deviceId || row.zoneId !== rows[0].zoneId,
    )
  )
    throw fail(
      400,
      'MIXED_DEVICE_BATCH',
      'A buffered batch must belong to one device and zone.',
    );
  const sensor = await Sensor.findOne({ deviceId: rows[0].deviceId }).select(
    '+keyHash',
  );
  const presented = Buffer.from(
      hashKey(typeof key === 'string' ? key : ''),
      'hex',
    ),
    expected = Buffer.from(sensor?.keyHash || '0'.repeat(64), 'hex');
  if (!sensor || !timingSafeEqual(presented, expected))
    throw fail(401, 'INVALID_DEVICE', 'Device credentials are invalid.');
  if (sensor.zoneId !== rows[0].zoneId)
    throw fail(
      403,
      'DEVICE_ZONE_MISMATCH',
      'Device is not registered to this zone.',
    );
  const receivedAt = new Date();
  let inserted = 0;
  for (const row of rows) {
    const original = row.ts || receivedAt.toISOString(),
      sampleAt = new Date(original),
      ts =
        !allowHistorical && Math.abs(+sampleAt - +receivedAt) > 300000
          ? receivedAt
          : sampleAt;
    const result = await Reading.updateOne(
      { readingKey: hashKey(`${sensor.deviceId}:${original}`) },
      {
        $setOnInsert: {
          ...row,
          storeId: sensor.storeId,
          ts,
          receivedAt,
          isDemo,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount) inserted++;
  }
  await Sensor.updateOne(
    { _id: sensor._id },
    { $set: { lastSeenAt: receivedAt } },
  );
  await processZone(sensor.storeId, sensor.zoneId, receivedAt);
  emitStore(sensor.storeId, 'zone:reading', { zoneId: sensor.zoneId });
  return { inserted, duplicates: rows.length - inserted };
}
const work = new Map();
export function processZone(storeId, zoneId, now = new Date()) {
  const key = `${storeId}:${zoneId}`,
    pending = (work.get(key) || Promise.resolve())
      .catch(() => {})
      .then(() => evaluateZone(storeId, zoneId, now));
  work.set(key, pending);
  pending
    .finally(() => {
      if (work.get(key) === pending) work.delete(key);
    })
    .catch(() => {});
  return pending;
}
async function evaluateZone(storeId, zoneId, now) {
  const store = await Store.findById(storeId).lean(),
    zone = store?.zones.find((z) => z.zoneId === zoneId);
  if (!zone) return;
  const thermal = await getRule('thermal'),
    shelf = await getRule('shelfLife');
  const readings = await Reading.find({
    storeId,
    zoneId,
    ts: { $gte: new Date(+now - 2 * 3600000), $lte: now },
  })
    .sort({ ts: 1 })
    .limit(1500)
    .lean();
  const owner = (
    await User.findOne({ storeIds: storeId, role: 'manager' }).lean()
  )?._id;
  const sensors = await Sensor.find({ storeId, zoneId }).lean();
  for (const sensor of sensors)
    if (!sensor.lastSeenAt || +now - +sensor.lastSeenAt > 300000)
      await Incident.updateOne(
        { dedupeKey: `silent:${sensor._id}` },
        {
          $setOnInsert: {
            storeId,
            zoneId,
            type: 'SENSOR_SILENT',
            severity: 2,
            summary: 'No sensor reading received for at least five minutes.',
            sourceRef: String(sensor._id),
            owner,
            dueAt: new Date(+now + 30 * 60000),
          },
        },
        { upsert: true },
      );
  const detected = detectExcursions({
    readings,
    limits: zone.limits,
    minMinutes: thermal.params.minMinutes,
    maxGapMinutes: thermal.params.maxGapMinutes,
  });
  let excursion = await Excursion.findOne({ storeId, zoneId, status: 'open' });
  const active = detected.at(-1);
  if (!excursion && active) {
    if (
      await Excursion.exists({
        storeId,
        zoneId,
        startedAt: new Date(active.startedAt),
        status: 'closed',
      })
    )
      return;
    const lots = await Lot.find({ storeId, zoneId, status: 'accepted' })
      .select('_id')
      .lean();
    excursion = await Excursion.create({
      storeId,
      zoneId,
      startedAt: new Date(active.startedAt),
      peakC: active.peakC,
      minutesOutside: active.minutesOutside,
      affectedLotIds: lots.map((l) => l._id),
      ruleVersion: thermal.version,
      isDemo: readings.some((r) => r.isDemo),
    });
    await Lot.updateMany(
      { _id: { $in: excursion.affectedLotIds }, status: 'accepted' },
      { $set: { status: 'quarantine' } },
    );
    await Incident.create({
      storeId,
      zoneId,
      type: 'TEMPERATURE_EXCURSION',
      severity: 2,
      summary: `Sustained temperature outside configured range in ${zone.name}. Lots held for review.`,
      sourceRef: String(excursion._id),
      owner,
      dueAt: new Date(+now + 30 * 60000),
      isDemo: excursion.isDemo,
    });
    emitStore(storeId, 'zone:alert', { zoneId, excursionId: excursion._id });
    emitStore(storeId, 'lot:status', { zoneId });
  }
  if (!excursion) return;
  const relevant = readings.filter((r) => +r.ts >= +excursion.startedAt),
    last = relevant.at(-1);
  if (last) {
    excursion.peakC = Math.max(
      excursion.peakC,
      ...relevant.map((r) => r.tempC),
    );
    excursion.minutesOutside = relevant.reduce((total, r, i) => {
      const prior = relevant[i - 1],
        elapsed = prior ? (+r.ts - +prior.ts) / 60000 : 0;
      return (
        total +
        (prior &&
        (prior.tempC < zone.limits.minC || prior.tempC > zone.limits.maxC) &&
        elapsed <= 5
          ? elapsed
          : 0)
      );
    }, 0);
  }
  const lastOutside = relevant.findLast(
      (r) => r.tempC < zone.limits.minC || r.tempC > zone.limits.maxC,
    ),
    recovery = lastOutside
      ? relevant.filter((r) => +r.ts > +lastOutside.ts)
      : [];
  const recovered =
    recovery.length >= 2 &&
    +recovery.at(-1).ts - +recovery[0].ts >= 300000 &&
    recovery.every((r, i) => !i || +r.ts - +recovery[i - 1].ts <= 300000);
  if (recovered) {
    const debit = thermalDebitDays({
      readings: relevant,
      refC: zone.limits.maxC,
      q10: thermal.params.q10,
      maxGapMinutes: thermal.params.maxGapMinutes,
    });
    for (const lot of await Lot.find({
      _id: { $in: excursion.affectedLotIds },
    })) {
      const effective = new Date(+lot.effectiveExpDate - debit * DAY),
        verdict = evaluateShelfLife({
          mfgDate: lot.mfgDate,
          expDate: effective,
          now,
          rule: shelf.params,
        });
      await Lot.updateOne(
        { _id: lot._id, appliedExcursionIds: { $ne: excursion._id } },
        {
          $set: {
            effectiveExpDate: effective,
            status: verdict.status === 'red' ? 'rejected' : 'quarantine',
            ruleVersion: shelf.version,
          },
          $inc: { thermalDebitDays: debit },
          $addToSet: { appliedExcursionIds: excursion._id },
        },
      );
    }
    excursion.status = 'closed';
    excursion.endedAt = last.ts;
    excursion.debitDays = debit;
    emitStore(storeId, 'lot:status', { zoneId });
  }
  await excursion.save();
}
export async function zoneSnapshot(storeId, zoneId, now = new Date()) {
  const [sensor, readings, excursions] = await Promise.all([
    Sensor.findOne({ storeId, zoneId }).lean(),
    Reading.find({ storeId, zoneId }).sort({ ts: -1 }).limit(120).lean(),
    Excursion.find({ storeId, zoneId })
      .sort({ startedAt: -1 })
      .limit(20)
      .lean(),
  ]);
  const status = !sensor
    ? 'unmonitored'
    : !sensor.lastSeenAt || +now - +sensor.lastSeenAt > 300000
      ? 'silent'
      : excursions.some((e) => e.status === 'open')
        ? 'excursion'
        : 'reporting';
  return { sensor, readings: readings.reverse(), excursions, status };
}
