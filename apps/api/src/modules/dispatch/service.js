import { Lot, Store } from '../../models/index.js';
import { Sensor, Reading, Excursion } from '../coldchain/models.js';
import { Incident } from '../incidents/model.js';
import { getRule } from '../../rules/index.js';
import { decideDispatch } from './decision.js';
import { DispatchCheck } from './models.js';
import { emitStore } from '../../realtime.js';
export async function checkItems({
  storeId,
  items,
  etaMinutes,
  now = new Date(),
  session = null,
  allowFefoOverride = false,
}) {
  const [lots, store, sensors, excursions, shelfRule, dispatchRule] =
    await Promise.all([
      Lot.find({ storeId }).populate('productId').session(session).lean(),
      Store.findById(storeId).session(session).lean(),
      Sensor.find({ storeId }).session(session).lean(),
      Excursion.find({ storeId, status: 'open' }).session(session).lean(),
      getRule('shelfLife'),
      getRule('dispatch'),
    ]);
  const resolved = items.map((item) => ({
      item,
      lot: lots.find((l) => String(l._id) === String(item.lotId)),
    })),
    zones = new Map();
  for (const zoneId of new Set(
    resolved.map((r) => r.lot?.zoneId).filter(Boolean),
  )) {
    const registered = sensors.filter((s) => s.zoneId === zoneId),
      latest = await Reading.findOne({ storeId, zoneId })
        .sort({ ts: -1 })
        .session(session)
        .lean(),
      limits = store?.zones.find((z) => z.zoneId === zoneId)?.limits;
    zones.set(zoneId, {
      status:
        registered.length &&
        registered.every(
          (s) => s.lastSeenAt && +now - +s.lastSeenAt <= 300000,
        ) &&
        !excursions.some((e) => e.zoneId === zoneId)
          ? 'reporting'
          : 'unknown',
      outside:
        !latest ||
        !limits ||
        +now - +latest.ts > 300000 ||
        latest.tempC < limits.minC ||
        latest.tempC > limits.maxC,
    });
  }
  const result = resolved.map(({ item, lot }) =>
    decideDispatch({
      lot,
      qty: item.qty,
      candidates: lots.filter(
        (l) => lot && String(l.productId?._id) === String(lot.productId?._id),
      ),
      zone: zones.get(lot?.zoneId),
      now,
      etaMinutes,
      dispatchRule: dispatchRule.params,
      shelfRule: shelfRule.params,
      allowFefoOverride,
    }),
  );
  return {
    items: result,
    blocked: result.some((i) => i.verdict === 'block'),
    ruleVersion: `${shelfRule.version}/${dispatchRule.version}`,
  };
}
export async function recordCheck({
  storeId,
  orderId,
  userId,
  result,
  latencyMs,
}) {
  await DispatchCheck.create({
    storeId,
    orderId,
    userId,
    ...result,
    latencyMs,
  });
  if (result.blocked) {
    emitStore(storeId, 'dispatch:veto', { orderId });
    for (const item of result.items.filter(
      (i) => i.verdict === 'block' && i.lotId,
    )) {
      const count = await DispatchCheck.countDocuments({
        storeId,
        createdAt: { $gte: new Date(Date.now() - 86400000) },
        items: { $elemMatch: { lotId: item.lotId, verdict: 'block' } },
      });
      if (count >= 3) {
        await Lot.updateOne(
          { _id: item.lotId, status: 'accepted' },
          { $set: { status: 'quarantine' } },
        );
        await Incident.updateOne(
          {
            dedupeKey: `dispatch:${storeId}:${item.lotId}:${new Date().toISOString().slice(0, 10)}`,
          },
          {
            $setOnInsert: {
              storeId,
              zoneId: item.zoneId,
              type: 'REPEATED_DISPATCH_BLOCK',
              severity: 2,
              summary:
                'This lot was blocked at dispatch at least three times in 24 hours.',
              sourceRef: String(item.lotId),
              dueAt: new Date(Date.now() + 3600000),
            },
          },
          { upsert: true },
        );
      }
    }
  }
}
