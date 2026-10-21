import { it, expect } from '@jest/globals';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
// Windows process.kill terminates without POSIX signal delivery. Linux CI verifies this boundary.
(process.platform === 'win32' ? it.skip : it)(
  'SIGTERM closes HTTP and Mongo cleanly',
  async () => {
    const mongo = await MongoMemoryServer.create(),
      reserve = createServer();
    await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('../src/server.js', import.meta.url))],
      {
        env: {
          ...process.env,
          MONGO_URI: mongo.getUri(),
          PORT: String(port),
          JWT_SECRET: 'shutdown-test-secret-over-thirty-two-characters',
          NODE_ENV: 'test',
        },
        stdio: 'ignore',
      },
    );
    const exited = once(child, 'exit');
    try {
      let ready = false;
      for (let i = 0; i < 200; i++) {
        ready = await fetch(`http://127.0.0.1:${port}/health`)
          .then((r) => r.ok)
          .catch(() => false);
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(ready).toBe(true);
      child.kill('SIGTERM');
      const [code, signal] = await exited;
      expect({ code, signal }).toEqual({ code: 0, signal: null });
      await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
    } finally {
      child.kill();
      await mongo.stop();
    }
  },
);
