import { beforeAll, afterAll, it, expect } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/index.js';
import { routeTable } from '../../../tools/route-table.js';
const config = {
  JWT_SECRET: 'matrix-secret-with-more-than-thirty-two-characters',
  CLIENT_ORIGIN: 'http://localhost',
  NODE_ENV: 'production',
};
const rows = routeTable(createApp(config));
let mongo;
const tokens = {};
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  for (const [i, role] of [
    'receiver',
    'picker',
    'manager',
    'area',
    'inspector',
    'admin',
  ].entries()) {
    const user = await User.create({
      name: role,
      phone: `800000000${i}`,
      role,
      passwordHash: 'unused',
      storeIds: [],
    });
    tokens[role] = jwt.sign({}, config.JWT_SECRET, {
      subject: String(user._id),
      issuer: 'freshwarden',
      audience: 'freshwarden-web',
    });
  }
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const concrete = (path) =>
  path.replace(/:[A-Za-z]+(?:\([^)]*\))?/g, '000000000000000000000000');
it.each(rows.filter((r) => r.authenticated))(
  'requires authentication for $path',
  async (row) => {
    const http = request(createApp(config));
    const res = await http[row.methods[0]](concrete(row.path)).send({});
    expect(res.status).toBe(401);
  },
);
const denied = rows
  .filter((r) => r.roles)
  .flatMap((row) =>
    ['receiver', 'picker', 'manager', 'area', 'inspector']
      .filter((role) => !row.roles.includes(role))
      .map((role) => ({ ...row, role })),
  );
it.each(denied)(
  'denies $role at $path before processing input',
  async (row) => {
    const http = request(createApp(config));
    const res = await http[row.methods[0]](concrete(row.path))
      .auth(tokens[row.role], { type: 'bearer' })
      .send({});
    expect(res.status).toBe(403);
  },
);
