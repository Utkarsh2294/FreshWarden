import { readFile, mkdir, writeFile } from 'node:fs/promises';
const base = process.env.API_URL || 'http://localhost:5000';
let password = process.env.EVAL_PASSWORD;
if (process.argv.includes('--demo'))
  password = JSON.parse(
    await readFile('.local/demo-credentials.json', 'utf8'),
  ).SEED_PASSWORD;
if (!password)
  throw new Error(
    'Set EVAL_PASSWORD or use --demo with the local generated development accounts.',
  );
async function call(path, { body, token } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  return data;
}
const { token } = await call('/auth/login', {
    body: { phone: process.env.EVAL_PHONE || '9000000003', password },
  }),
  stores = await call('/stores', { token }),
  storeId = process.env.EVAL_STORE_ID || stores[0]?._id;
if (!storeId) throw new Error('No assigned store.');
const lots = await call(`/lots?storeId=${storeId}`, { token }),
  bad = lots.find((l) => l.status === 'rejected'),
  good = lots.find(
    (l) =>
      l.status === 'accepted' &&
      l.qty > 0 &&
      new Date(l.effectiveExpDate) > new Date(Date.now() + 2 * 86400000),
  );
if (!bad || !good)
  throw new Error(
    'Need at least one rejected and one accepted lot with quantity.',
  );
let blockedBad = 0,
  falseBlocks = 0;
const latencies = [],
  results = [];
for (let i = 0; i < 50; i++) {
  const unsafe = i % 5 === 0,
    lot = unsafe ? bad : good,
    started = performance.now(),
    result = await call('/dispatch/check', {
      token,
      body: {
        storeId,
        orderId: `EVAL-${Date.now()}-${i}`,
        etaMinutes: 15,
        items: [{ lotId: lot._id, qty: 1 }],
      },
    });
  const latencyMs = performance.now() - started;
  latencies.push(latencyMs);
  results.push({
    lotId: lot._id,
    unsafeExpected: unsafe,
    blocked: result.blocked,
    latencyMs,
  });
  if (unsafe && result.blocked) blockedBad++;
  if (!unsafe && result.blocked) falseBlocks++;
}
latencies.sort((a, b) => a - b);
const report = {
  measuredAt: new Date().toISOString(),
  scope:
    '50 sequential local HTTP requests to configured API and database; synthetic store data, not a load test',
  orders: 50,
  badOrders: 10,
  blockedBad,
  falseBlocks,
  p50Ms: latencies[24],
  p95Ms: latencies[47],
  results,
};
await mkdir('docs/evaluation', { recursive: true });
await writeFile(
  'docs/evaluation/dispatch-results.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
if (blockedBad !== 10 || falseBlocks) process.exitCode = 1;
