import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { User, Lot } from '../src/models/index.js';
import { Sensor, Reading, Excursion } from '../src/modules/coldchain/models.js';
import { Incident } from '../src/modules/incidents/model.js';
import {
  ingest,
  hashKey,
  processZone,
  zoneSnapshot,
} from '../src/modules/coldchain/service.js';
const config = {
    JWT_SECRET: 'coldchain-test-secret-more-than-32-chars',
    CLIENT_ORIGIN: 'http://localhost:5173',
    NODE_ENV: 'test',
  },
  app = createApp(config);
let mongo, store, token;
const device = 'test-chiller',
  key = 'test-device-secret-not-production';
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  store = await seed('coldchain-test-password');
  await Sensor.create({
    storeId: store._id,
    zoneId: 'chiller-1',
    deviceId: device,
    keyHash: hashKey(key),
    lastSeenAt: new Date(),
  });
  await Promise.all([Sensor.init(), Reading.init(), Excursion.init()]);
  token = jwt.sign({}, config.JWT_SECRET, {
    subject: String((await User.findOne({ phone: '9000000001' }))._id),
    issuer: 'freshwarden',
    audience: 'freshwarden-web',
  });
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const row = (extra = {}) => ({
  deviceId: device,
  zoneId: 'chiller-1',
  tempC: 3,
  ts: new Date().toISOString(),
  ...extra,
});
describe('device ingestion', () => {
  it('valid device ingestion accepts and deduplicates', async () => {
    const sample = row(),
      first = await request(app)
        .post('/api/telemetry')
        .set('x-device-key', key)
        .send(sample),
      second = await request(app)
        .post('/api/telemetry')
        .set('x-device-key', key)
        .send(sample);
    expect(first.status).toBe(202);
    expect(first.body.inserted).toBe(1);
    expect(second.body.duplicates).toBe(1);
  });
  it('wrong device key is rejected', async () =>
    expect(
      (
        await request(app)
          .post('/api/telemetry')
          .set('x-device-key', 'wrong')
          .send(row())
      ).status,
    ).toBe(401));
  it('wrong registered zone is denied', async () =>
    expect(
      (
        await request(app)
          .post('/api/telemetry')
          .set('x-device-key', key)
          .send(row({ zoneId: 'frozen-1' }))
      ).status,
    ).toBe(403));
  it.each([-127, 81])('invalid temperature %s is rejected', async (tempC) =>
    expect(
      (
        await request(app)
          .post('/api/telemetry')
          .set('x-device-key', key)
          .send(row({ tempC }))
      ).status,
    ).toBe(400),
  );
  it('clock drift uses server time', async () => {
    const original = new Date(Date.now() - 86400000).toISOString();
    await ingest(row({ ts: original }), key);
    const reading = await Reading.findOne({
      readingKey: hashKey(`${device}:${original}`),
    });
    expect(Math.abs(+reading.ts - Date.now())).toBeLessThan(10000);
  });
  it('unmonitored zone stays unknown', async () =>
    expect((await zoneSnapshot(store._id, 'frozen-1')).status).toBe(
      'unmonitored',
    ));
  it('simulator is absent outside development', async () =>
    expect(
      (
        await request(app)
          .post('/api/coldchain/simulate')
          .auth(token, { type: 'bearer' })
          .send({})
      ).status,
    ).toBe(404));
  it('key rotation invalidates the old key', async () => {
    const registration = await request(app)
      .post('/api/sensors')
      .auth(token, { type: 'bearer' })
      .send({
        storeId: String(store._id),
        zoneId: 'ambient-1',
        deviceId: 'rotate-test',
      });
    const rotated = await request(app)
      .post(`/api/sensors/${registration.body.sensorId}/rotate-key`)
      .auth(token, { type: 'bearer' })
      .send({});
    expect(rotated.status).toBe(200);
    expect(rotated.body.key).not.toBe(registration.body.key);
    expect(
      (
        await request(app)
          .post('/api/telemetry')
          .set('x-device-key', registration.body.key)
          .send(row({ deviceId: 'rotate-test', zoneId: 'ambient-1' }))
      ).status,
    ).toBe(401);
  });
});
describe('sustained excursion loop', () => {
  it('short door spike leaves lots unchanged', async () => {
    const before = await Lot.countDocuments({
        storeId: store._id,
        status: 'accepted',
      }),
      now = Date.now();
    await ingest(
      [
        row({
          ts: new Date(now - 30000).toISOString(),
          tempC: 12,
          doorOpen: true,
        }),
        row({ ts: new Date(now - 10000).toISOString(), tempC: 3 }),
      ],
      key,
    );
    expect(await Excursion.countDocuments()).toBe(0);
    expect(
      await Lot.countDocuments({ storeId: store._id, status: 'accepted' }),
    ).toBe(before);
  });
  it('sustained hot trace holds lots, then applies estimated debit once', async () => {
    await Reading.deleteMany({ storeId: store._id, zoneId: 'chiller-1' });
    const now = Date.now(),
      rows = Array.from({ length: 31 }, (_, i) =>
        row({ ts: new Date(now - (30 - i) * 30000).toISOString(), tempC: 15 }),
      );
    await ingest(rows, key, { allowHistorical: true, isDemo: true });
    const excursion = await Excursion.findOne({
      storeId: store._id,
      status: 'open',
    });
    expect(excursion).toBeTruthy();
    expect(
      await Lot.countDocuments({
        _id: { $in: excursion.affectedLotIds },
        status: 'accepted',
      }),
    ).toBe(0);
    const recover = Array.from({ length: 12 }, (_, i) =>
      row({ ts: new Date(now + (i + 1) * 30000).toISOString(), tempC: 3 }),
    );
    await ingest(recover, key, { allowHistorical: true, isDemo: true });
    await processZone(store._id, 'chiller-1', new Date(now + 360000));
    const closed = await Excursion.findById(excursion._id);
    expect(closed.status).toBe('closed');
    expect(closed.debitDays).toBeGreaterThan(0);
    const lot = await Lot.findById(excursion.affectedLotIds[0]);
    expect(lot.thermalDebitDays).toBeGreaterThan(0);
    expect(lot.status).toBe('quarantine');
    const expiry = +lot.effectiveExpDate;
    await processZone(store._id, 'chiller-1', new Date(now + 390000));
    expect(+(await Lot.findById(lot._id)).effectiveExpDate).toBe(expiry);
    expect(await Excursion.countDocuments()).toBe(1);
  });
  it('silent sensor creates a deduplicated incident', async () => {
    await Sensor.updateOne(
      { deviceId: device },
      { $set: { lastSeenAt: new Date(Date.now() - 360000) } },
    );
    await processZone(store._id, 'chiller-1');
    await processZone(store._id, 'chiller-1');
    expect(
      await Incident.countDocuments({
        type: 'SENSOR_SILENT',
        sourceRef: String((await Sensor.findOne({ deviceId: device }))._id),
      }),
    ).toBe(1);
    expect((await zoneSnapshot(store._id, 'chiller-1')).status).toBe('silent');
  });
});
