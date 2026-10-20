import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { User, Product, Store, Lot } from '../src/models/index.js';
const config = {
  JWT_SECRET: 'test-only-secret-with-more-than-32-characters',
  CLIENT_ORIGIN: 'http://localhost:5173',
};
const app = createApp(config);
let mongo, store, managerToken, pickerToken;
const tokenFor = async (phone) =>
  jwt.sign({}, config.JWT_SECRET, {
    subject: String((await User.findOne({ phone }))._id),
    expiresIn: '1h',
    issuer: 'freshwarden',
    audience: 'freshwarden-web',
  });
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  store = await seed('test-password-only-123');
  managerToken = await tokenFor('9000000001');
  pickerToken = await tokenFor('9000000003');
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
describe('platform persistence and access', () => {
  it('seeds 150 products, 5 roles, 3 zones and lots', async () => {
    expect(await Product.countDocuments()).toBe(150);
    expect(await User.countDocuments()).toBe(5);
    expect(store.zones).toHaveLength(3);
    expect(await Lot.countDocuments()).toBe(12);
  });
  it('seed is idempotent', async () => {
    await seed('different-password-123');
    expect(await Product.countDocuments()).toBe(150);
    expect(await User.countDocuments()).toBe(5);
  });
  it('healthy with connected Mongo', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
  });
  it('valid login returns a signed token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ phone: '9000000001', password: 'test-password-only-123' });
    expect(response.status).toBe(200);
    expect(jwt.verify(response.body.token, config.JWT_SECRET).sub).toBeTruthy();
  });
  it('wrong password fails', async () => {
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ phone: '9000000001', password: 'bad' })
      ).status,
    ).toBe(401);
  });
  it('unknown phone fails', async () => {
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ phone: '9999999999', password: 'bad' })
      ).status,
    ).toBe(401);
  });
  it('NoSQL operator is not a phone', async () => {
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ phone: { $ne: null }, password: 'bad' })
      ).status,
    ).toBe(400);
  });
  it('rejects expired tokens', async () => {
    const expired = jwt.sign({}, config.JWT_SECRET, {
      subject: '000000000000000000000000',
      expiresIn: -1,
      issuer: 'freshwarden',
      audience: 'freshwarden-web',
    });
    expect(
      (await request(app).get('/api/me').auth(expired, { type: 'bearer' }))
        .status,
    ).toBe(401);
  });
  it('never exposes password hash', async () => {
    const res = await request(app)
      .get('/api/me')
      .auth(managerToken, { type: 'bearer' });
    expect(res.body.role).toBe('manager');
    expect(res.body.passwordHash).toBeUndefined();
  });
  it('unauthenticated store is denied', async () => {
    expect((await request(app).get('/api/stores')).status).toBe(401);
  });
  it('assigned store overview is populated', async () => {
    const res = await request(app)
      .get(`/api/stores/${store._id}/overview`)
      .auth(managerToken, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body.lots[0].productId.name).toBeTruthy();
  });
  it('cross-store access denied', async () => {
    const other = await Store.create({ name: 'Other' });
    expect(
      (
        await request(app)
          .get(`/api/stores/${other._id}/overview`)
          .auth(pickerToken, { type: 'bearer' })
      ).status,
    ).toBe(403);
  });
  it('catalog lookup uses persisted product', async () => {
    const res = await request(app)
      .get('/api/catalog/lookup?barcode=8900000000000')
      .auth(managerToken, { type: 'bearer' });
    expect(res.body.brand).toBe('Amul');
  });
  it('unknown barcode is explicit', async () => {
    expect(
      (
        await request(app)
          .get('/api/catalog/lookup?barcode=9999999999999')
          .auth(managerToken, { type: 'bearer' })
      ).status,
    ).toBe(404);
  });
  it('picker cannot access rule management', async () => {
    expect(
      (
        await request(app)
          .get('/api/rules')
          .auth(pickerToken, { type: 'bearer' })
      ).status,
    ).toBe(403);
  });
  it('manager can read versioned rules', async () => {
    const res = await request(app)
      .get('/api/rules')
      .auth(managerToken, { type: 'bearer' });
    expect(res.body[0].version).toBe('prototype-v1');
  });
  it('picker cannot import products', async () => {
    expect(
      (
        await request(app)
          .post('/api/catalog/import')
          .auth(pickerToken, { type: 'bearer' })
          .set('Content-Type', 'text/csv')
          .send('barcode,name\n12345678,Test')
      ).status,
    ).toBe(403);
  });
  it('CSV import handles valid, duplicate, and invalid rows', async () => {
    const token = await tokenFor('9000000005');
    const csv =
      'barcode,name,brand,category,shelfLifeDays,storageType,isFood\n9999999999998,"Test, item",Demo,Staple,60,ambient,true\n8900000000000,Duplicate,Demo,Staple,60,ambient,true\ninvalid,Bad,Demo,Staple,60,ambient,true';
    const res = await request(app)
      .post('/api/catalog/import')
      .auth(token, { type: 'bearer' })
      .set('Content-Type', 'text/csv')
      .send(csv);
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.errors).toHaveLength(2);
  });
  it('picker cannot edit zone limits', async () => {
    expect(
      (
        await request(app)
          .patch(`/api/stores/${store._id}/zones/chiller-1`)
          .auth(pickerToken, { type: 'bearer' })
          .send({})
      ).status,
    ).toBe(403);
  });
  it('manager cannot set inverted zone limits', async () => {
    expect(
      (
        await request(app)
          .patch(`/api/stores/${store._id}/zones/chiller-1`)
          .auth(managerToken, { type: 'bearer' })
          .send({
            zoneId: 'chiller-1',
            name: 'Chiller',
            type: 'chilled',
            limits: { minC: 8, maxC: 2 },
          })
      ).status,
    ).toBe(400);
  });
});
