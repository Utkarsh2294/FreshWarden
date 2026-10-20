import { beforeAll, afterAll, describe, it, expect, jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { User, Lot, Evidence } from '../src/models/index.js';
import { decideInward } from '../src/modules/inward/decision.js';
import { DEFAULT_RULE, DAY } from '../src/rules/shelfLife.js';
import { createGateway } from '../src/llm/gateway.js';
import { labelSchema, labelJsonSchema } from '../src/llm/schemas.js';
const config = {
  JWT_SECRET: 'integration-secret-long-enough-for-tests',
  CLIENT_ORIGIN: 'http://localhost:5173',
  LLM_MAX_RPM_GEMINI: 60000,
};
const gateway = {
  image: jest.fn(async () => ({ data: null, error: 'PROVIDER_UNCONFIGURED' })),
};
const app = createApp(config, { gateway });
let mongo, store, picture, manager, receiver, picker;
const now = new Date('2026-10-20T00:00:00Z'),
  rule = { params: DEFAULT_RULE, version: 'test-v1' },
  product = { shelfLifeDays: 90 };
const safeFields = {
  mfgDate: '2026-10-01',
  expDate: '2026-12-30',
  mrp: 50,
  fssaiNo: '12345678901234',
  confidence: 0.95,
  batchNo: 'CHECK',
};
const signed = async (phone) =>
  jwt.sign({}, config.JWT_SECRET, {
    subject: String((await User.findOne({ phone }))._id),
    issuer: 'freshwarden',
    audience: 'freshwarden-web',
  });
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  store = await seed('inward-test-password');
  manager = await signed('9000000001');
  receiver = await signed('9000000002');
  picker = await signed('9000000003');
  picture = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#fff' },
  })
    .jpeg()
    .toBuffer();
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
function scan(fields = {}, token = receiver, options = {}) {
  return request(app)
    .post('/api/inward/verify')
    .auth(token, { type: 'bearer' })
    .field('storeId', String(store._id))
    .field('zoneId', options.zone || 'ambient-1')
    .field('barcode', options.barcode || '8900000000003')
    .field('requestId', options.requestId || randomUUID())
    .field('source', options.source || 'manual')
    .field('fields', JSON.stringify(fields))
    .attach('image', picture, {
      filename: 'pack.jpg',
      contentType: 'image/jpeg',
    });
}
describe('two-signal safety decisions', () => {
  it('catalog consistency and confident OCR gives green', () =>
    expect(
      decideInward({ fields: safeFields, product, rule, now, source: 'ocr' })
        .status,
    ).toBe('green'));
  it('manual values never auto accept', () =>
    expect(
      decideInward({ fields: safeFields, product, rule, now }).status,
    ).toBe('amber'));
  it('one uncertain vision signal stays amber', () =>
    expect(
      decideInward({
        fields: { ...safeFields, confidence: 0.5 },
        product,
        rule,
        now,
        source: 'gemini',
      }).status,
    ).toBe('amber'));
  it('OCR and vision agreement can verify catalog mismatch', () =>
    expect(
      decideInward({
        fields: safeFields,
        product: { shelfLifeDays: 180 },
        rule,
        now,
        source: 'gemini',
        ocr: { confidence: 0.9, expDate: '30/12/2026' },
      }).status,
    ).toBe('green'));
  it('conflicting OCR and catalog never gives green', () =>
    expect(
      decideInward({
        fields: safeFields,
        product: { shelfLifeDays: 180 },
        rule,
        now,
        source: 'gemini',
        ocr: { confidence: 0.9, expDate: '01/12/2026' },
      }).status,
    ).toBe('amber'));
  it.each(['fssaiNo', 'mrp'])('missing %s needs review', (key) =>
    expect(
      decideInward({
        fields: { ...safeFields, [key]: null },
        product,
        rule,
        now,
        source: 'ocr',
      }).status,
    ).toBe('amber'),
  );
  it('an expired item is red regardless of signals', () =>
    expect(
      decideInward({
        fields: { ...safeFields, mfgDate: '2026-01-01', expDate: '2026-03-31' },
        product,
        rule,
        now,
        source: 'ocr',
      }).status,
    ).toBe('red'));
});
describe('persisted inward decisions', () => {
  it('stores evidence hash and a rule version', async () => {
    const res = await scan(safeFields);
    expect(res.status).toBe(201);
    expect(res.body.verdict.status).toBe('amber');
    expect(res.body.ruleVersion).toBe('prototype-v1');
    const evidence = await Evidence.findById(res.body.evidenceId);
    expect(evidence.sha256).toMatch(/^[a-f\d]{64}$/);
  });
  it('picker cannot verify', async () =>
    expect((await scan(safeFields, picker)).status).toBe(403));
  it('wrong storage zone fails before evidence creation', async () =>
    expect(
      (await scan(safeFields, receiver, { zone: 'chiller-1' })).status,
    ).toBe(400));
  it('replay returns the same scan', async () => {
    const requestId = randomUUID(),
      first = await scan(safeFields, receiver, { requestId }),
      second = await scan(safeFields, receiver, { requestId });
    expect(second.body._id).toBe(first.body._id);
  });
  it('receiver cannot accept amber', async () => {
    const res = await scan(safeFields);
    expect(
      (
        await request(app)
          .post(`/api/inward/${res.body._id}/confirm`)
          .auth(receiver, { type: 'bearer' })
          .send({ action: 'accept' })
      ).status,
    ).toBe(403);
  });
  it('supervisor can approve complete nonexpired manual evidence once', async () => {
    const exp = new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10),
      mfg = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
    const res = await scan({ ...safeFields, mfgDate: mfg, expDate: exp });
    const before = await Lot.countDocuments();
    const first = await request(app)
      .post(`/api/inward/${res.body._id}/confirm`)
      .auth(manager, { type: 'bearer' })
      .send({ action: 'accept' });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('accept');
    const second = await request(app)
      .post(`/api/inward/${res.body._id}/confirm`)
      .auth(manager, { type: 'bearer' })
      .send({ action: 'accept' });
    expect(second.body.lotId).toBe(first.body.lotId);
    expect(await Lot.countDocuments()).toBe(before + 1);
  });
  it('red cannot be accepted by a manager', async () => {
    const res = await scan({
      ...safeFields,
      mfgDate: '2020-01-01',
      expDate: '2020-04-01',
    });
    expect(
      (
        await request(app)
          .post(`/api/inward/${res.body._id}/confirm`)
          .auth(manager, { type: 'bearer' })
          .send({ action: 'accept' })
      ).status,
    ).toBe(409);
  });
  it('provider failure keeps amber, never a fake success', async () => {
    const res = await scan({ confidence: 0.1 }, receiver, { source: 'ocr' });
    expect(res.body.verdict.status).toBe('amber');
    expect(res.body.verdict.reasons).toContain('PROVIDER_UNCONFIGURED');
  });
  it('evidence cannot be read outside assigned store', async () => {
    const res = await scan(safeFields);
    const unauthorized = jwt.sign({}, config.JWT_SECRET, {
      subject: String(new mongoose.Types.ObjectId()),
      issuer: 'freshwarden',
      audience: 'freshwarden-web',
    });
    expect(
      (
        await request(app)
          .get(`/api/evidence/${res.body.evidenceId}`)
          .auth(unauthorized, { type: 'bearer' })
      ).status,
    ).toBe(401);
  });
  it('corrupt photo rejected', async () => {
    const res = await request(app)
      .post('/api/inward/verify')
      .auth(receiver, { type: 'bearer' })
      .field('storeId', String(store._id))
      .field('zoneId', 'ambient-1')
      .field('barcode', '8900000000003')
      .field('requestId', randomUUID())
      .field('source', 'manual')
      .field('fields', '{}')
      .attach('image', Buffer.from('not an image'), {
        filename: 'pack.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(415);
  });
});
describe('gateway safety and cache', () => {
  const full = {
    productName: null,
    brand: null,
    batchNo: null,
    mfgDate: null,
    expDate: null,
    bestBeforeText: null,
    mrp: null,
    fssaiNo: null,
    confidence: 0,
    fieldsUnreadable: [],
    notes: '',
  };
  const args = {
    buffer: Buffer.from('image'),
    purpose: 'test',
    prompt: 'Only visible text',
    schema: labelSchema,
    jsonSchema: labelJsonSchema,
  };
  it('same hash and purpose reuse validated output', async () => {
    const generate = jest.fn(async () => ({ text: JSON.stringify(full) })),
      audit = jest.fn(async () => {}),
      g = createGateway(config, { generate, audit });
    await g.image(args);
    const second = await g.image(args);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(second.cacheHit).toBe(true);
    expect(audit).toHaveBeenCalledTimes(2);
  });
  it.each(['not-json', '{}'])(
    'malformed response %s fails closed',
    async (text) => {
      const g = createGateway(config, {
        generate: async () => ({ text }),
        audit: async () => {},
      });
      expect((await g.image(args)).needsHuman).toBe(true);
    },
  );
  it('unconfigured provider degrades to human', async () => {
    const g = createGateway(config, { audit: async () => {} });
    expect((await g.image(args)).error).toBe('PROVIDER_UNCONFIGURED');
  });
});
