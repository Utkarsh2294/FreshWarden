import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
await mkdir('.local/mongo', { recursive: true });
let credentials;
try {
  credentials = JSON.parse(
    await readFile('.local/demo-credentials.json', 'utf8'),
  );
} catch {
  credentials = {
    JWT_SECRET: randomBytes(32).toString('hex'),
    SEED_PASSWORD: randomBytes(12).toString('base64url'),
  };
  await writeFile('.local/demo-credentials.json', JSON.stringify(credentials), {
    mode: 0o600,
  });
}
console.log(
  'Starting local development database. First run downloads MongoDB from its official distribution.',
);
const mongo = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [
    {
      dbPath: path.resolve('.local/mongo'),
    },
  ],
});
const env = {
  ...process.env,
  ...credentials,
  MONGO_URI: mongo.getUri('freshwarden'),
  NODE_ENV: 'development',
  CLIENT_ORIGIN: 'http://localhost:5177',
};
const seed = spawn(process.execPath, ['apps/api/src/seed.js'], {
  env,
  stdio: 'inherit',
});
const code = await new Promise((resolve) => seed.on('exit', resolve));
if (code) {
  await mongo.stop();
  process.exit(code);
}
const networkSeed = spawn(process.execPath, ['tools/seed-network.js'], {
  env,
  stdio: 'inherit',
});
const networkCode = await new Promise((resolve) =>
  networkSeed.on('exit', resolve),
);
if (networkCode) {
  await mongo.stop();
  process.exit(networkCode);
}
console.log('Local demo: http://localhost:5177 · manager phone 9000000001');
console.log(
  'Your generated local password is saved in .local/demo-credentials.json (ignored by Git).',
);
const api = spawn(process.execPath, ['--watch', 'apps/api/src/server.js'], {
  env,
  stdio: 'inherit',
});
const web = spawn(
  process.execPath,
  [
    path.resolve('node_modules/vite/bin/vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    '5177',
    '--strictPort',
  ],
  { cwd: 'apps/web', env, stdio: 'inherit' },
);
web.on('error', (error) => console.error(error.message));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  await mongo.stop({ doCleanup: false });
  process.exit();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
