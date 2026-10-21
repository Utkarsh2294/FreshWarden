import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../../apps/api/src/app.js';
import { seed } from '../../apps/api/src/seed.js';
import { Lot, User } from '../../apps/api/src/models/index.js';
import { Sensor } from '../../apps/api/src/modules/coldchain/models.js';
import {
  hashKey,
  ingest,
} from '../../apps/api/src/modules/coldchain/service.js';
const mongo = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});
const config = {
  JWT_SECRET: randomBytes(32).toString('hex'),
  CLIENT_ORIGIN: 'http://localhost',
  NODE_ENV: 'test',
};
const password = randomBytes(24).toString('hex');
let server;
try {
  await mongoose.connect(mongo.getUri());
  const store = await seed(password);
  for (const zone of store.zones) {
    const key = randomBytes(32).toString('hex'),
      deviceId = `bench-${zone.zoneId}`;
    await Sensor.create({
      storeId: store._id,
      zoneId: zone.zoneId,
      deviceId,
      keyHash: hashKey(key),
      isDemo: true,
    });
    await ingest(
      {
        deviceId,
        zoneId: zone.zoneId,
        tempC: (zone.limits.minC + zone.limits.maxC) / 2,
      },
      key,
      { isDemo: true },
    );
  }
  const listen = async () => {
    server = createApp(config).listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  };
  let base = await listen();
  const child = spawn(process.execPath, ['tools/eval/simulateOrders.js'], {
    env: {
      ...process.env,
      API_URL: base,
      EVAL_PASSWORD: password,
      NODE_ENV: 'test',
    },
    stdio: 'inherit',
  });
  const [code] = await once(child, 'exit');
  if (code) throw new Error('Sequential dispatch benchmark failed.');
  await new Promise((resolve) => server.close(resolve));
  base = await listen();
  const user = await User.findOne({ role: 'picker' }),
    lot = await Lot.findOne({ status: 'rejected' });
  const token = jwt.sign({}, config.JWT_SECRET, {
    subject: String(user._id),
    issuer: 'freshwarden',
    audience: 'freshwarden-web',
  });
  const start = performance.now(),
    rows = await Promise.all(
      Array.from({ length: 150 }, async (_, i) => {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, i * 20 - (performance.now() - start)),
          ),
        );
        const began = performance.now();
        const response = await fetch(`${base}/api/dispatch/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            storeId: String(store._id),
            orderId: `LOAD-${i}`,
            items: [{ lotId: String(lot._id), qty: 1 }],
          }),
        });
        return { status: response.status, ms: performance.now() - began };
      }),
    );
  const durations = rows.map((r) => r.ms).sort((a, b) => a - b);
  const load = {
    measuredAt: new Date().toISOString(),
    scope:
      'Synthetic isolated local HTTP/API/replica-set, 150 attempts scheduled at 50 rps for 3 seconds; includes normal production rate limiting. Native fetch driver, not a sustained-capacity claim.',
    attempts: rows.length,
    elapsedMs: performance.now() - start,
    statuses: Object.fromEntries(
      [...new Set(rows.map((r) => r.status))].map((status) => [
        status,
        rows.filter((r) => r.status === status).length,
      ]),
    ),
    p50Ms: durations[74],
    p95Ms: durations[142],
  };
  const explain = await Lot.find({ storeId: store._id, status: 'accepted' })
    .sort({ effectiveExpDate: 1 })
    .explain('executionStats');
  await mkdir('docs/evaluation', { recursive: true });
  await writeFile(
    'docs/evaluation/load-results.json',
    JSON.stringify(load, null, 2),
  );
  await writeFile(
    'docs/evaluation/index-results.json',
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        scope: 'Seeded 12-lot store only; re-run on pilot-sized data',
        plan: explain.queryPlanner.winningPlan,
        keysExamined: explain.executionStats.totalKeysExamined,
        documentsExamined: explain.executionStats.totalDocsExamined,
        returned: explain.executionStats.nReturned,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(load, null, 2));
  if (rows.some((r) => r.status >= 500)) process.exitCode = 1;
} finally {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
}
