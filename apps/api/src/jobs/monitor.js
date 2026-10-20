import { Store } from '../models/index.js';
import { processZone } from '../modules/coldchain/service.js';
import { logger } from '../config/logger.js';
import { flagMissedScan } from '../modules/shelf/service.js';
import { buildSnapshot } from '../modules/reports/snapshot.js';
export function startMonitor() {
  let running = false;
  let lastSnapshot = 0;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const stores = await Store.find().lean();
      for (const store of stores)
        for (const zone of store.zones) {
          await processZone(store._id, zone.zoneId);
          await flagMissedScan(store._id, zone.zoneId);
        }
      if (Date.now() - lastSnapshot >= 15 * 60000) {
        for (const store of stores) await buildSnapshot(store._id);
        lastSnapshot = Date.now();
      }
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
