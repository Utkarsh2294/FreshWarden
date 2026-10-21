import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/error.js';
import { authRoutes } from './modules/auth/routes.js';
import { storeRoutes } from './modules/stores/routes.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { createGateway } from './llm/gateway.js';
import { createMetrics } from './metrics.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { route } from './middleware/error.js';
import { inwardRoutes } from './modules/inward/routes.js';
import { coldchainRoutes } from './modules/coldchain/routes.js';
import { shelfRoutes } from './modules/shelf/routes.js';
import { incidentRoutes } from './modules/incidents/routes.js';
import { dispatchRoutes } from './modules/dispatch/routes.js';
import {
  publicInspectorRoutes,
  reportRoutes,
} from './modules/reports/routes.js';
export function createApp(config, { gateway } = {}) {
  const app = express();
  const metrics = createMetrics();
  gateway ||= createGateway(config, { observe: metrics.observe });
  app.disable('x-powered-by');
  app.use(
    helmet(),
    cors({ origin: config.CLIENT_ORIGIN }),
    pinoHttp({
      logger,
      genReqId: () => randomUUID(),
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url
            ?.split('?')[0]
            .replace(/(\/inspector\/)[a-f\d]{64}/gi, '$1[redacted]'),
        }),
      },
    }),
  );
  app.use(metrics.middleware, express.json({ limit: '64kb' }));
  app.get(
    '/metrics',
    rateLimit({ windowMs: 60000, limit: 30 }),
    requireAuth(config),
    requireRole('admin'),
    route(async (_req, res) => {
      const result = await metrics.scrape();
      res.type(result.type).send(result.body);
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );
  app.get('/health', (_req, res) =>
    res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
      status: mongoose.connection.readyState === 1 ? 'ok' : 'degraded',
      uptimeSec: Math.floor(process.uptime()),
      mongo: mongoose.connection.readyState === 1 ? 'up' : 'down',
      version: '0.1.0',
      llm: gateway.status?.() || { configured: false, circuit: 'unavailable' },
    }),
  );
  app.use(
    ['/api/inward/verify', '/api/shelf/scan'],
    rateLimit({
      windowMs: 60000,
      limit: 12,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );
  app.use(
    '/api',
    authRoutes(config),
    publicInspectorRoutes(),
    coldchainRoutes(config),
    storeRoutes(config),
    catalogRoutes(config),
    inwardRoutes(config, gateway),
    shelfRoutes(config, gateway),
    incidentRoutes(config, gateway),
    dispatchRoutes(config),
    reportRoutes(config, gateway),
  );
  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
  );
  app.use(errorHandler);
  return app;
}
