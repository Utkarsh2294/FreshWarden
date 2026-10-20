import { createHash } from 'node:crypto';
import { Store, Lot, Evidence, Rule } from '../../models/index.js';
import { Reading, Excursion } from '../coldchain/models.js';
import { zoneSnapshot } from '../coldchain/service.js';
import { Incident } from '../incidents/model.js';
import { InwardRecord } from '../inward/model.js';
import { ShelfScan } from '../shelf/model.js';
import { DispatchCheck, DispatchOrder } from '../dispatch/models.js';
import { scoreLot, healthScore } from '../risk/score.js';
import { getRule } from '../../rules/index.js';
import { HealthSnapshot } from './models.js';
import { labelInstant, DAY } from '../../rules/shelfLife.js';
import { fail } from '../../middleware/error.js';
export const indiaDate = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export function dayRange(date) {
  const from = new Date(labelInstant(date));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(+from) ||
    indiaDate(from) !== date
  )
    throw fail(400, 'INVALID_DATE', 'Use a valid YYYY-MM-DD date.');
  return { from, to: new Date(+from + DAY) };
}
export async function buildSnapshot(storeId, date = indiaDate()) {
  const { from, to } = dayRange(date),
    range = { $gte: from, $lt: to },
    store = await Store.findById(storeId).lean();
  if (!store) throw fail(404, 'NOT_FOUND', 'Store not found.');
  const [
    lots,
    incidents,
    inward,
    scans,
    checks,
    orders,
    readings,
    excursions,
    evidence,
    rules,
    riskRule,
  ] = await Promise.all([
    Lot.find({ storeId })
      .populate('productId')
      .sort({ effectiveExpDate: 1 })
      .limit(1000)
      .lean(),
    Incident.find({ storeId }).sort({ createdAt: -1 }).limit(1000).lean(),
    InwardRecord.find({ storeId, createdAt: range }).lean(),
    ShelfScan.find({ storeId, createdAt: range }).lean(),
    DispatchCheck.find({ storeId, createdAt: range }).lean(),
    DispatchOrder.find({ storeId, packedAt: range, status: 'packed' }).lean(),
    Reading.find({ storeId, ts: range }).sort({ ts: 1 }).limit(10000).lean(),
    Excursion.find({ storeId, startedAt: range }).lean(),
    Evidence.find({ storeId, takenAt: range })
      .sort({ takenAt: -1 })
      .limit(100)
      .lean(),
    Rule.find({ effectiveFrom: { $lte: new Date() } })
      .select('key version notes')
      .lean(),
    getRule('risk'),
  ]);
  const zones = [];
  for (const zone of store.zones) {
    const snapshot = await zoneSnapshot(storeId, zone.zoneId);
    const selected = readings.filter((r) => r.zoneId === zone.zoneId);
    zones.push({
      ...zone,
      status: snapshot.status,
      lastReading: snapshot.readings.at(-1) || null,
      readingIds: selected.map((r) => r._id),
      readingCount: selected.length,
      minC: selected.length ? Math.min(...selected.map((r) => r.tempC)) : null,
      maxC: selected.length ? Math.max(...selected.map((r) => r.tempC)) : null,
      points: selected.slice(-60).map((r) => ({ ts: r.ts, tempC: r.tempC })),
    });
  }
  const open = incidents.filter(
      (i) => !['closed', 'dismissed'].includes(i.status),
    ),
    reviewedZones = new Set(
      scans.filter((s) => s.status === 'reviewed').map((s) => s.zoneId),
    );
  const checklist = [
    {
      key: 'temperature',
      label: 'Fresh sensor coverage and in-range readings for every zone',
      status: zones.every(
        (z) =>
          z.status === 'reporting' &&
          z.lastReading &&
          z.lastReading.tempC >= z.limits.minC &&
          z.lastReading.tempC <= z.limits.maxC,
      )
        ? 'complete'
        : readings.length
          ? 'attention'
          : 'not_available',
      refs: readings.map((r) => r._id),
    },
    {
      key: 'inward',
      label: 'Every inward scan has a completed disposition',
      status: inward.length
        ? inward.every(
            (i) => i.status !== 'pending' && i.status !== 'confirming',
          )
          ? 'complete'
          : 'attention'
        : 'not_available',
      refs: inward.map((i) => i._id),
    },
    {
      key: 'shelf',
      label: 'Reviewed shelf evidence for every zone today',
      status:
        reviewedZones.size === store.zones.length
          ? 'complete'
          : scans.length
            ? 'attention'
            : 'not_available',
      refs: scans.map((s) => s._id),
    },
    {
      key: 'incidents',
      label: 'No open corrective action is past its deadline',
      status: open.some((i) => i.dueAt < new Date()) ? 'attention' : 'complete',
      refs: open.map((i) => i._id),
    },
    {
      key: 'segregation',
      label: 'Packed mixed orders have separate food and non-food bags',
      status: orders.length
        ? orders.every(
            (o) =>
              !o.result.items.some((i) => !i.isFood) ||
              !o.result.items.some((i) => i.isFood) ||
              (o.nonFoodBagId && o.nonFoodBagId !== o.foodBagId),
          )
          ? 'complete'
          : 'attention'
        : 'not_available',
      refs: orders.map((o) => o._id),
    },
  ];
  const coverageComplete = checklist
      .filter((i) => ['temperature', 'shelf', 'inward'].includes(i.key))
      .every((i) => i.status === 'complete'),
    health = healthScore(
      {
        lotCount: lots.length,
        acceptedCount: lots.filter((l) => l.status === 'accepted').length,
        incidentSeverity: open.reduce((sum, i) => sum + i.severity, 0),
        excursionMinutes: excursions.reduce(
          (sum, e) => sum + e.minutesOutside,
          0,
        ),
        missedScans: open.filter((i) => i.type === 'SCAN_MISSED').length,
        blocks: checks.filter((c) => c.blocked).length,
        coverageComplete,
      },
      riskRule.params.health,
    );
  const risk = lots
    .map((lot) => ({
      lotId: lot._id,
      name: lot.productId?.name || 'Unknown product',
      batchNo: lot.batchNo,
      status: lot.status,
      ...scoreLot(lot, {
        weights: riskRule.params.weights,
        hygieneNorm: Math.min(
          1,
          open
            .filter((i) => i.zoneId === lot.zoneId)
            .reduce((sum, i) => sum + i.severity, 0) / 9,
        ),
      }),
    }))
    .sort((a, b) => b.score - a.score);
  const snapshot = {
    store: {
      _id: store._id,
      name: store.name,
      city: store.city,
      location: store.location,
      fssaiLicenceNo: store.fssaiLicenceNo,
      isDemo: store.isDemo,
    },
    date,
    period: { from, to },
    generatedAt: new Date(),
    inventoryScope:
      'Current register at generation time, not a historical stock reconstruction.',
    coverageComplete,
    health,
    counts: {
      lots: lots.length,
      acceptedLots: lots.filter((l) => l.status === 'accepted').length,
      openIncidents: open.length,
      inwardChecks: inward.length,
      shelfScans: scans.length,
      dispatchChecks: checks.length,
      dispatchBlocks: checks.filter((c) => c.blocked).length,
      packedOrders: orders.length,
      readings: readings.length,
    },
    checklist,
    zones,
    risk: risk.slice(0, 100),
    lots: lots.map((l) => ({
      _id: l._id,
      name: l.productId?.name || 'Unknown product',
      batchNo: l.batchNo,
      status: l.status,
      qty: l.qty,
      zoneId: l.zoneId,
      expDate: l.expDate,
      effectiveExpDate: l.effectiveExpDate,
      evidenceIds: l.evidenceIds,
      ruleVersion: l.ruleVersion,
    })),
    incidents: incidents.map((i) => ({
      _id: i._id,
      type: i.type,
      summary: i.summary,
      status: i.status,
      severity: i.severity,
      zoneId: i.zoneId,
      dueAt: i.dueAt,
      evidenceId: i.evidenceId,
      capa: i.capa,
    })),
    evidence: evidence.map((e) => ({
      _id: e._id,
      kind: e.kind,
      sha256: e.sha256,
      takenAt: e.takenAt,
    })),
    excursions: excursions.map((e) => ({
      _id: e._id,
      zoneId: e.zoneId,
      status: e.status,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      peakC: e.peakC,
      minutesOutside: e.minutesOutside,
      debitDays: e.debitDays,
      isDemo: e.isDemo,
    })),
    rules: rules.map((r) => ({
      key: r.key,
      version: r.version,
      notes: r.notes,
    })),
  };
  snapshot.snapshotHash = createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');
  if (date === indiaDate())
    await HealthSnapshot.updateOne(
      { storeId, date },
      {
        $set: { score: health.score, status: health.status, coverageComplete },
      },
      { upsert: true },
    );
  return snapshot;
}
