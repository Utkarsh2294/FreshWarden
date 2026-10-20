import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { readFile, readdir } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { User, Lot, Product } from '../src/models/index.js';
import { Sensor, Reading } from '../src/modules/coldchain/models.js';
import { DispatchOrder } from '../src/modules/dispatch/models.js';
import { decideDispatch } from '../src/modules/dispatch/decision.js';
import { DEFAULT_RULE, DAY } from '../src/rules/shelfLife.js';
const config = {
    JWT_SECRET: 'dispatch-test-secret-more-than-32-chars',
    CLIENT_ORIGIN: 'http://localhost:5173',
  },
  app = createApp(config),
  dispatchRule = { etaBufferMin: 15, enforceFefo: true };
let mongo, store, picker, manager, good, bad;
const authToken = async (phone) =>
  jwt.sign({}, config.JWT_SECRET, {
    subject: String((await User.findOne({ phone }))._id),
    issuer: 'freshwarden',
    audience: 'freshwarden-web',
  });
const baseLot = {
  _id: 'a',
  productId: { _id: 'p', isFood: true },
  status: 'accepted',
  qty: 5,
  zoneId: 'ambient-1',
  mfgDate: new Date(Date.now() - DAY),
  expDate: new Date(Date.now() + 9 * DAY),
  effectiveExpDate: new Date(Date.now() + 9 * DAY),
  createdAt: new Date(),
};
const decide = (extra) =>
  decideDispatch({
    lot: baseLot,
    qty: 1,
    candidates: [baseLot],
    zone: { status: 'reporting', outside: false },
    dispatchRule,
    shelfRule: DEFAULT_RULE,
    ...extra,
  });
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongo.getUri());
  store = await seed('dispatch-test-password');
  picker = await authToken('9000000003');
  manager = await authToken('9000000001');
  await DispatchOrder.init();
  for (const zone of store.zones) {
    await Sensor.create({
      storeId: store._id,
      zoneId: zone.zoneId,
      deviceId: `test-${zone.zoneId}`,
      keyHash: 'a'.repeat(64),
      lastSeenAt: new Date(),
    });
    await Reading.create({
      storeId: store._id,
      zoneId: zone.zoneId,
      deviceId: `test-${zone.zoneId}`,
      readingKey: zone.zoneId,
      ts: new Date(),
      receivedAt: new Date(),
      tempC: zone.limits.maxC - 1,
    });
  }
  good = await Lot.findOne({ storeId: store._id, batchNo: 'DEMO-004' });
  bad = await Lot.findOne({ storeId: store._id, status: 'rejected' });
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const check = (id, items, token = picker) =>
  request(app)
    .post('/api/dispatch/check')
    .auth(token, { type: 'bearer' })
    .send({ storeId: String(store._id), orderId: id, items, etaMinutes: 15 });
const pack = (id, revision, extra = {}) =>
  request(app)
    .post('/api/dispatch/pack')
    .auth(picker, { type: 'bearer' })
    .send({
      storeId: String(store._id),
      orderId: id,
      revision,
      foodBagId: 'food-bag',
      ...extra,
    });
describe('dispatch rules', () => {
  it('safe lot passes', () => expect(decide().verdict).toBe('ok'));
  it('unknown lot blocks', () =>
    expect(decide({ lot: null }).verdict).toBe('block'));
  it.each(['quarantine', 'rejected', 'discarded', 'dispatched'])(
    '%s always blocks',
    (status) =>
      expect(decide({ lot: { ...baseLot, status } }).verdict).toBe('block'),
  );
  it('zero qty blocks', () =>
    expect(
      decide({ lot: { ...baseLot, qty: 0 } }).reasons.map((r) => r.code),
    ).toContain('INSUFFICIENT_STOCK'));
  it('silent zone blocks', () =>
    expect(decide({ zone: { status: 'silent' } }).verdict).toBe('block'));
  it('current out-of-range reading blocks before an excursion opens', () =>
    expect(
      decide({ zone: { status: 'reporting', outside: true } }).verdict,
    ).toBe('block'));
  it('expires ten minutes after delivery but before buffer blocks', () => {
    const now = new Date(),
      exp = new Date(+now + 25 * 60000);
    expect(
      decide({
        now,
        etaMinutes: 15,
        lot: {
          ...baseLot,
          mfgDate: new Date(+now - 60000),
          effectiveExpDate: exp,
        },
      }).verdict,
    ).toBe('block');
  });
  it('FEFO suggests an earlier eligible lot', () => {
    const earlier = {
      ...baseLot,
      _id: 'older',
      effectiveExpDate: new Date(Date.now() + 5 * DAY),
    };
    const res = decide({ candidates: [baseLot, earlier] });
    expect(res.verdict).toBe('block');
    expect(res.suggestLotId).toBe('older');
  });
  it('explicit FEFO exception never overrides quarantine', () =>
    expect(
      decide({
        lot: { ...baseLot, status: 'quarantine' },
        allowFefoOverride: true,
      }).verdict,
    ).toBe('block'));
  it('module has no model-provider imports', async () => {
    for (const name of await readdir(
      new URL('../src/modules/dispatch/', import.meta.url),
    )) {
      const source = await readFile(
        new URL(`../src/modules/dispatch/${name}`, import.meta.url),
        'utf8',
      );
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:llm|genai|groq)/i);
    }
  });
});
describe('order lifecycle and atomic stock', () => {
  it('picker cannot override', async () =>
    expect(
      (
        await request(app)
          .post('/api/dispatch/override')
          .auth(picker, { type: 'bearer' })
          .send({})
      ).status,
    ).toBe(403));
  it('hard safety veto cannot be overridden by manager', async () => {
    await check('bad-order', [{ lotId: String(bad._id), qty: 1 }]);
    const response = await request(app)
      .post('/api/dispatch/override')
      .auth(manager, { type: 'bearer' })
      .send({
        storeId: String(store._id),
        orderId: 'bad-order',
        reason: 'Supervisor checked this item manually.',
      });
    expect(response.status).toBe(409);
  });
  it('mixed order requires separate bags and packs once', async () => {
    const product = await Product.findOne({ isFood: false }),
      nonfood = await Lot.create({
        storeId: store._id,
        productId: product._id,
        batchNo: 'NONFOOD',
        mfgDate: new Date(Date.now() - DAY),
        expDate: new Date(Date.now() + 30 * DAY),
        effectiveExpDate: new Date(Date.now() + 30 * DAY),
        qty: 3,
        zoneId: 'ambient-1',
        status: 'accepted',
      });
    const checked = await check('mixed', [
      { lotId: String(good._id), qty: 1 },
      { lotId: String(nonfood._id), qty: 1 },
    ]);
    expect(checked.body.blocked).toBe(false);
    expect((await pack('mixed', checked.body.revision)).status).toBe(400);
    const packed = await pack('mixed', checked.body.revision, {
      nonFoodBagId: 'nonfood-bag',
    });
    expect(packed.status).toBe(200);
    expect(packed.body.status).toBe('packed');
    const qty = (await Lot.findById(nonfood._id)).qty;
    expect(
      (
        await pack('mixed', checked.body.revision, {
          nonFoodBagId: 'nonfood-bag',
        })
      ).status,
    ).toBe(200);
    expect((await Lot.findById(nonfood._id)).qty).toBe(qty);
  });
  it('two pickers cannot consume the same last unit', async () => {
    const product = await Product.create({
        barcode: '9999999999997',
        name: 'Concurrency test',
        shelfLifeDays: 10,
        storageType: 'ambient',
      }),
      lot = await Lot.create({
        storeId: store._id,
        productId: product._id,
        batchNo: 'LAST',
        mfgDate: new Date(Date.now() - DAY),
        expDate: new Date(Date.now() + 9 * DAY),
        effectiveExpDate: new Date(Date.now() + 9 * DAY),
        qty: 1,
        zoneId: 'ambient-1',
        status: 'accepted',
      });
    const first = await check('last-a', [{ lotId: String(lot._id), qty: 1 }]),
      second = await check('last-b', [{ lotId: String(lot._id), qty: 1 }]);
    const packed = await Promise.all([
      pack('last-a', first.body.revision),
      pack('last-b', second.body.revision),
    ]);
    expect(packed.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Lot.findById(lot._id)).qty).toBe(0);
  });
  it('edited revision cannot pack', async () => {
    const checked = await check('revision', [
      { lotId: String(good._id), qty: 1 },
    ]);
    await check('revision', [{ lotId: String(good._id), qty: 2 }]);
    expect((await pack('revision', checked.body.revision)).status).toBe(409);
  });
  it('50 HTTP order checks block all seeded bad lots and report measured latency', async () => {
    const latencies = [];
    let unsafeBlocked = 0,
      falseBlocks = 0;
    for (let i = 0; i < 50; i++) {
      const unsafe = i % 5 === 0,
        start = performance.now(),
        res = await check(`sim-${i}`, [
          { lotId: String(unsafe ? bad._id : good._id), qty: 1 },
        ]);
      latencies.push(performance.now() - start);
      expect(res.status).toBe(200);
      if (unsafe && res.body.blocked) unsafeBlocked++;
      if (!unsafe && res.body.blocked) falseBlocks++;
    }
    latencies.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        scope: 'local Supertest HTTP + replica-set MongoDB; no network load',
        orders: 50,
        badOrders: 10,
        unsafeBlocked,
        falseBlocks,
        p50Ms: latencies[24],
        p95Ms: latencies[47],
      }),
    );
    expect(unsafeBlocked).toBe(10);
    expect(falseBlocks).toBe(0);
  }, 120000);
});
