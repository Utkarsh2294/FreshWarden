import { Store } from '../models/index.js';
import { processZone } from '../modules/coldchain/service.js';
import { logger } from '../config/logger.js';
export function startMonitor() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      for (const store of await Store.find().lean())
        for (const zone of store.zones)
          await processZone(store._id, zone.zoneId);
    } catch (error) {
      logger.error(
        { code: error.code || 'MONITOR_FAILED' },
        'Safety monitoring job failed',
      );
    } finally {
      running = false;
    }
  }, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
