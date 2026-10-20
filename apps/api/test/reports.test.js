import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { User, Store } from '../src/models/index.js';
import { buildSnapshot, dayRange } from '../src/modules/reports/snapshot.js';
import { InspectorLink, AuditReport } from '../src/modules/reports/models.js';
import { healthScore, scoreLot } from '../src/modules/risk/score.js';
import { selectFacts } from '../src/modules/reports/summary.js';
const config = {
    JWT_SECRET: 'report-test-secret-more-than-32-characters',
    CLIENT_ORIGIN: 'http://localhost:5173',
  },
  app = createApp(config);
let mongo, store, manager, picker;
const signed = async (phone) =>
  jwt.sign({}, config.JWT_SECRET, {
    subject: String((await User.findOne({ phone }))._id),
    issuer: 'freshwarden',
    audience: 'freshwarden-web',
  });
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  store = await seed('report-test-password');
  manager = await signed('9000000001');
  picker = await signed('9000000003');
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
describe('evidence scores and summaries', () => {
  it('missing coverage is unavailable rather than 100', () =>
    expect(healthScore({ lotCount: 10, acceptedCount: 10 }).score).toBeNull());
  it('bounded health score uses recorded penalties', () =>
    expect(
      healthScore({
        lotCount: 10,
        acceptedCount: 10,
        coverageComplete: true,
        incidentSeverity: 2,
      }).score,
    ).toBe(96));
  it('empty inventory cannot establish health', () =>
    expect(
      healthScore({ lotCount: 0, acceptedCount: 0, coverageComplete: true })
        .status,
    ).toBe('insufficient_evidence'));
  it('risk is bounded and explains contributors', () => {
    const risk = scoreLot({
      expDate: 'bad',
      effectiveExpDate: 'bad',
      evidenceIds: [],
    });
    expect(risk.score).toBeLessThanOrEqual(100);
    expect(risk.factors.length).toBeLessThanOrEqual(3);
    expect(risk.estimated).toBe(true);
  });
  it('summary cannot add an unprovided number or fact', () =>
    expect(
      selectFacts(
        [{ id: 'only', text: '2 scans recorded.' }],
        ['unsafe invented 99'],
      ),
    ).toBeNull());
  it('summary renders only exact database grounded fact text', () =>
    expect(
      selectFacts([{ id: 'only', text: '2 scans recorded.' }], ['only']),
    ).toEqual(['2 scans recorded.']));
  it('uses Indian reporting day boundaries', () =>
    expect(dayRange('2026-10-20').from.toISOString()).toBe(
      '2026-10-19T18:30:00.000Z',
    ));
  it.each(['2026-02-31', 'wrong'])('invalid report day %s rejected', (date) =>
    expect(() => dayRange(date)).toThrow(),
  );
  it('snapshot figures match actual database records', async () => {
    const snapshot = await buildSnapshot(store._id);
    expect(snapshot.counts.lots).toBe(12);
    expect(snapshot.counts.acceptedLots).toBe(10);
    expect(snapshot.counts.readings).toBe(0);
    expect(snapshot.coverageComplete).toBe(false);
    expect(snapshot.checklist.find((i) => i.key === 'temperature').status).toBe(
      'not_available',
    );
    expect(snapshot.snapshotHash).toMatch(/^[a-f\d]{64}$/);
  });
});
describe('reports and expiring read-only inspector access', () => {
  it('picker cannot export a manager audit', async () =>
    expect(
      (
        await request(app)
          .get(`/api/reports/daily?storeId=${store._id}`)
          .auth(picker, { type: 'bearer' })
      ).status,
    ).toBe(403));
  it('PDF starts with a valid header and hash matches bytes', async () => {
    const res = await request(app)
      .get(`/api/reports/daily?storeId=${store._id}`)
      .auth(manager, { type: 'bearer' })
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(3000);
    expect(createHash('sha256').update(res.body).digest('hex')).toBe(
      res.headers['x-report-sha256'],
    );
    expect(await AuditReport.countDocuments()).toBe(1);
  });
  it('link supports read-only access and immediate revocation', async () => {
    const res = await request(app)
      .post('/api/inspector/links')
      .auth(manager, { type: 'bearer' })
      .send({ storeId: String(store._id), hours: 1 });
    expect(res.status).toBe(201);
    const token = res.body.url.split('/').at(-1),
      view = await request(app).get(`/api/inspector/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.readOnly).toBe(true);
    expect(view.body.snapshot.store._id).toBe(String(store._id));
    expect(
      (
        await request(app)
          .post('/api/dispatch/check')
          .auth(token, { type: 'bearer' })
          .send({})
      ).status,
    ).toBe(401);
    await request(app)
      .delete(`/api/inspector/links/${res.body.id}`)
      .auth(manager, { type: 'bearer' });
    expect((await request(app).get(`/api/inspector/${token}`)).status).toBe(
      404,
    );
  });
  it('expired link cannot be used', async () => {
    const token = 'b'.repeat(64);
    await InspectorLink.create({
      storeId: store._id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await request(app).get(`/api/inspector/${token}`)).status).toBe(
      404,
    );
  });
  it('link list never exposes token hashes', async () => {
    const res = await request(app)
      .get(`/api/inspector/links?storeId=${store._id}`)
      .auth(manager, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body[0].tokenHash).toBeUndefined();
  });
  it('cannot create a link for another store', async () => {
    const other = await Store.create({ name: 'Other store' });
    expect(
      (
        await request(app)
          .post('/api/inspector/links')
          .auth(manager, { type: 'bearer' })
          .send({ storeId: String(other._id), hours: 1 })
      ).status,
    ).toBe(403);
  });
});
