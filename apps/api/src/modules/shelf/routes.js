import { Router } from 'express';
import { z } from 'zod';
import { ShelfScan } from './model.js';
import { scanShelf, scanSchedule, createFindingTask } from './service.js';
import { upload } from '../inward/evidence.js';
import {
  requireAuth,
  requireRole,
  assertStore,
} from '../../middleware/auth.js';
import { route, fail } from '../../middleware/error.js';
import { objectId } from '../stores/routes.js';
export function shelfRoutes(config, gateway) {
  const router = Router();
  router.use(requireAuth(config));
  router.post(
    '/shelf/scan',
    requireRole('receiver', 'manager'),
    upload,
    route(async (req, res) => {
      const input = z
        .object({ storeId: objectId, zoneId: z.string().min(1).max(40) })
        .strict()
        .parse(req.body);
      assertStore(req.user, input.storeId);
      res.status(201).json(
        await scanShelf({
          ...input,
          file: req.file,
          userId: req.user._id,
          gateway,
        }),
      );
    }),
  );
  router.get(
    '/shelf',
    requireRole('receiver', 'manager', 'area'),
    route(async (req, res) => {
      const storeId = objectId.parse(req.query.storeId);
      assertStore(req.user, storeId);
      const zoneId = z.string().max(40).parse(req.query.zoneId);
      res.json({
        scans: await ShelfScan.find({ storeId, zoneId })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),
        schedule: await scanSchedule(storeId, zoneId),
      });
    }),
  );
  router.patch(
    '/shelf/:id/findings/:index',
    requireRole('manager'),
    route(async (req, res) => {
      const input = z
          .object({
            action: z.enum(['confirm', 'dismiss']),
            note: z.string().min(5).max(500),
          })
          .strict()
          .parse(req.body),
        scan = await ShelfScan.findById(objectId.parse(req.params.id));
      if (!scan) throw fail(404, 'NOT_FOUND', 'Scan not found.');
      assertStore(req.user, scan.storeId);
      const index = z.coerce
          .number()
          .int()
          .min(0)
          .max(99)
          .parse(req.params.index),
        finding = scan.result.findings[index];
      if (!finding) throw fail(404, 'NOT_FOUND', 'Finding not found.');
      if (scan.reviews.some((r) => r.index === index))
        throw fail(
          409,
          'ALREADY_REVIEWED',
          'This finding already has a review.',
        );
      scan.reviews.push({ index, ...input, by: req.user._id, at: new Date() });
      await scan.save();
      if (input.action === 'confirm') await createFindingTask(scan, finding);
      res.json(scan);
    }),
  );
  return router;
}
