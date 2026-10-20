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
import { inwardRoutes } from './modules/inward/routes.js';
import { coldchainRoutes } from './modules/coldchain/routes.js';
import { shelfRoutes } from './modules/shelf/routes.js';
import { incidentRoutes } from './modules/incidents/routes.js';
export function createApp(config, { gateway = createGateway(config) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet(),
    cors({ origin: config.CLIENT_ORIGIN }),
    pinoHttp({ logger, genReqId: () => randomUUID() }),
  );
  app.use(express.json({ limit: '64kb' }));
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
    }),
  );
  app.use(
    '/api',
    authRoutes(config),
    coldchainRoutes(config),
    storeRoutes(config),
    catalogRoutes(config),
    inwardRoutes(config, gateway),
    shelfRoutes(config, gateway),
    incidentRoutes(config, gateway),
  );
  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
  );
  app.use(errorHandler);
  return app;
}
