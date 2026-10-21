import mongoose from 'mongoose';
import { readEnv } from './config/env.js';
import { connectDb } from './config/db.js';
import { logger } from './config/logger.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { startMonitor } from './jobs/monitor.js';
let config;
try {
  config = readEnv();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
await connectDb(config.MONGO_URI);
const server = createApp(config).listen(
  config.PORT,
  process.env.HOST || '127.0.0.1',
  () => logger.info({ port: config.PORT }, 'FreshWarden API ready'),
);
const io = attachRealtime(server, config);
const stopMonitor = startMonitor();
server.on('error', (error) => {
  logger.error(
    { code: error.code },
    error.code === 'EADDRINUSE'
      ? 'Port already in use; choose another PORT'
      : 'Server failed',
  );
  process.exit(1);
});
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    stopMonitor();
    // Socket.IO closes its attached HTTP server and waits for in-flight requests.
    io.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
