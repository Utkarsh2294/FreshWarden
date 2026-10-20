import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Sensor } from './models.js';
import { Store } from '../../models/index.js';
import {
  requireAuth,
  requireRole,
  assertStore,
} from '../../middleware/auth.js';
import { route, fail } from '../../middleware/error.js';
import { objectId } from '../stores/routes.js';
import { ingest, hashKey, zoneSnapshot } from './service.js';
export function coldchainRoutes(config) {
  const router = Router();
  router.post(
    '/telemetry',
    route(async (req, res) =>
      res.status(202).json(await ingest(req.body, req.headers['x-device-key'])),
    ),
  );
  router.use(requireAuth(config));
  router.post(
    '/sensors',
    requireRole('manager'),
    route(async (req, res) => {
      const input = z
        .object({
          storeId: objectId,
          zoneId: z.string().min(1).max(40),
          deviceId: z.string().regex(/^[a-zA-Z\d-]{1,60}$/),
        })
        .strict()
        .parse(req.body);
      assertStore(req.user, input.storeId);
      const store = await Store.findById(input.storeId);
      if (!store?.zones.some((z) => z.zoneId === input.zoneId))
        throw fail(400, 'UNKNOWN_ZONE', 'Choose an existing zone.');
      const key = randomBytes(32).toString('hex');
      const sensor = await Sensor.create({ ...input, keyHash: hashKey(key) });
      res
        .status(201)
        .json({ sensorId: sensor._id, deviceId: sensor.deviceId, key });
    }),
  );
  router.post(
    '/sensors/:id/rotate-key',
    requireRole('manager'),
    route(async (req, res) => {
      z.object({}).strict().parse(req.body);
      const sensor = await Sensor.findById(objectId.parse(req.params.id));
      if (!sensor) throw fail(404, 'NOT_FOUND', 'Sensor not found.');
      assertStore(req.user, sensor.storeId);
      const key = randomBytes(32).toString('hex');
      sensor.keyHash = hashKey(key);
      await sensor.save();
      res.json({ key });
    }),
  );
  router.get(
    '/zones/:zoneId/readings',
    route(async (req, res) => {
      const storeId = objectId.parse(req.query.storeId);
      assertStore(req.user, storeId);
      const zoneId = z.string().max(40).parse(req.params.zoneId);
      res.json(await zoneSnapshot(storeId, zoneId));
    }),
  );
  if (config.NODE_ENV === 'development')
    router.post(
      '/coldchain/simulate',
      requireRole('manager'),
      route(async (req, res) => {
        const input = z
          .object({
            storeId: objectId,
            zoneId: z.string().min(1).max(40),
            scenario: z.enum([
              'normal',
              'door-open',
              'compressor-fail',
              'sensor-dead',
            ]),
          })
          .strict()
          .parse(req.body);
        assertStore(req.user, input.storeId);
        const store = await Store.findById(input.storeId).lean(),
          zone = store?.zones.find((z) => z.zoneId === input.zoneId);
        if (!zone) throw fail(400, 'UNKNOWN_ZONE', 'Choose a zone.');
        const deviceId = `demo-${store._id}-${zone.zoneId}`,
          key = randomBytes(32).toString('hex');
        await Sensor.findOneAndUpdate(
          { deviceId },
          {
            $set: {
              storeId: input.storeId,
              zoneId: zone.zoneId,
              keyHash: hashKey(key),
              isDemo: true,
            },
          },
          { upsert: true, new: true },
        );
        const target = zone.limits.maxC,
          normal = target - 2,
          now = Date.now(),
          rows = Array.from({ length: 41 }, (_, i) => ({
            deviceId,
            zoneId: zone.zoneId,
            ts: new Date(now - (40 - i) * 30000).toISOString(),
            tempC:
              ['normal', 'sensor-dead'].includes(input.scenario) || i >= 30
                ? normal
                : input.scenario === 'door-open'
                  ? i === 5
                    ? target + 7
                    : normal
                  : target + 2 + i * 0.3,
            doorOpen: input.scenario === 'door-open' && i === 5,
          }));
        const result = await ingest(rows, key, {
          allowHistorical: true,
          isDemo: true,
        });
        if (input.scenario === 'sensor-dead')
          await Sensor.updateOne(
            { deviceId },
            { $set: { lastSeenAt: new Date(now - 360000) } },
          );
        res.json({ ...result, simulation: true, scenario: input.scenario });
      }),
    );
  return router;
}
