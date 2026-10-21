import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { Excursion } from './modules/coldchain/models.js';
import { DispatchCheck } from './modules/dispatch/models.js';
export function createMetrics() {
  const registry = new Registry();
  const duration = new Histogram({
    name: 'freshwarden_http_seconds',
    help: 'HTTP duration by route template',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const calls = new Counter({
    name: 'freshwarden_llm_calls_total',
    help: 'Gateway outcomes, including unavailable providers',
    labelNames: ['provider', 'outcome', 'cache'],
    registers: [registry],
  });
  const excursions = new Gauge({
    name: 'freshwarden_excursions',
    help: 'Persisted excursions',
    registers: [registry],
  });
  const blocked = new Gauge({
    name: 'freshwarden_dispatch_blocks',
    help: 'Persisted blocked dispatch checks',
    registers: [registry],
  });
  return {
    middleware(req, res, next) {
      const stop = duration.startTimer();
      res.on('finish', () =>
        stop({
          method: req.method,
          route: req.route?.path || 'unmatched',
          status: String(res.statusCode),
        }),
      );
      next();
    },
    observe(entry) {
      calls.inc({
        provider: entry.provider,
        outcome: entry.ok ? 'ok' : 'failed',
        cache: entry.cacheHit ? 'hit' : 'miss',
      });
    },
    async scrape() {
      const [a, b] = await Promise.all([
        Excursion.countDocuments(),
        DispatchCheck.countDocuments({ blocked: true }),
      ]);
      excursions.set(a);
      blocked.set(b);
      return { type: registry.contentType, body: await registry.metrics() };
    },
  };
}
