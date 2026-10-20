import { Router } from 'express';
import { z } from 'zod';
import { Incident } from './model.js';
import { ShelfScan } from '../shelf/model.js';
import { Evidence, Store } from '../../models/index.js';
import { scanShelf } from '../shelf/service.js';
import { zoneSnapshot } from '../coldchain/service.js';
import { upload } from '../inward/evidence.js';
import {
  requireAuth,
  requireRole,
  assertStore,
} from '../../middleware/auth.js';
import { route, fail } from '../../middleware/error.js';
import { objectId } from '../stores/routes.js';
import { emitStore } from '../../realtime.js';
export function incidentRoutes(config, gateway) {
  const router = Router();
  router.use(requireAuth(config));
  router.get(
    '/incidents',
    requireRole('receiver', 'manager', 'area'),
    route(async (req, res) => {
      const storeId = objectId.parse(req.query.storeId);
      assertStore(req.user, storeId);
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(1)
        .parse(req.query.page);
      res.json({
        items: await Incident.find({ storeId })
          .populate('owner', 'name')
          .sort({ status: 1, dueAt: 1 })
          .skip((page - 1) * 30)
          .limit(30)
          .lean(),
        total: await Incident.countDocuments({ storeId }),
        page,
      });
    }),
  );
  router.post(
    '/incidents',
    requireRole('receiver', 'manager'),
    upload,
    route(async (req, res) => {
      const input = z
        .object({
          storeId: objectId,
          zoneId: z.string().min(1).max(40),
          summary: z.string().min(5).max(500),
          severity: z.coerce.number().int().min(1).max(3),
        })
        .strict()
        .parse(req.body);
      assertStore(req.user, input.storeId);
      const scan = await scanShelf({
        ...input,
        file: req.file,
        userId: req.user._id,
        gateway,
      });
      res.status(201).json(
        await Incident.create({
          ...input,
          type: 'MANUAL',
          evidenceId: scan.evidenceId,
          sourceRef: String(scan._id),
          owner: req.user._id,
          dueAt: new Date(Date.now() + 3600000),
        }),
      );
    }),
  );
  router.patch(
    '/incidents/:id/capa',
    requireRole('manager'),
    upload,
    route(async (req, res) => {
      const input = z
          .object({ action: z.string().min(10).max(1000) })
          .strict()
          .parse(req.body),
        incident = await Incident.findById(objectId.parse(req.params.id));
      if (!incident) throw fail(404, 'NOT_FOUND', 'Incident not found.');
      assertStore(req.user, incident.storeId);
      if (incident.status === 'closed') return res.json(incident);
      const scan = await scanShelf({
        file: req.file,
        storeId: incident.storeId,
        zoneId: incident.zoneId,
        userId: req.user._id,
        gateway,
      });
      if (
        scan.status !== 'reviewed' ||
        scan.result.findings.some((f) => f.type === incident.type)
      )
        throw fail(
          409,
          'PROOF_NOT_VERIFIED',
          'Proof could not establish that this finding is absent. The incident remains open.',
        );
      const original = incident.evidenceId
          ? await Evidence.findById(incident.evidenceId).lean()
          : null,
        proof = await Evidence.findById(scan.evidenceId).lean();
      if (original && original.sha256 === proof.sha256)
        throw fail(
          409,
          'SAME_PROOF',
          'Use a new photo showing the corrective action.',
        );
      if (['SENSOR_SILENT', 'TEMPERATURE_EXCURSION'].includes(incident.type)) {
        const state = await zoneSnapshot(incident.storeId, incident.zoneId),
          store = await Store.findById(incident.storeId).lean(),
          zone = store.zones.find((z) => z.zoneId === incident.zoneId),
          last = state.readings.at(-1);
        if (
          state.status !== 'reporting' ||
          !last ||
          last.tempC < zone.limits.minC ||
          last.tempC > zone.limits.maxC
        )
          throw fail(
            409,
            'ZONE_UNSAFE',
            'Sensor coverage and temperature must recover before closure.',
          );
      }
      incident.status = 'closed';
      incident.capa = {
        action: input.action,
        proofImageId: scan.evidenceId,
        closedBy: req.user._id,
        closedAt: new Date(),
      };
      await incident.save();
      emitStore(incident.storeId, 'incident:new', { incidentId: incident._id });
      res.json(incident);
    }),
  );
  router.patch(
    '/incidents/:id/dismiss',
    requireRole('manager'),
    route(async (req, res) => {
      const input = z
          .object({ reason: z.string().min(10).max(500) })
          .strict()
          .parse(req.body),
        incident = await Incident.findById(objectId.parse(req.params.id));
      if (!incident) throw fail(404, 'NOT_FOUND', 'Incident not found.');
      assertStore(req.user, incident.storeId);
      if (['TEMPERATURE_EXCURSION', 'SENSOR_SILENT'].includes(incident.type))
        throw fail(
          409,
          'RECOVERY_REQUIRED',
          'Restore coverage and submit corrective evidence.',
        );
      incident.status = 'dismissed';
      incident.capa = {
        action: input.reason,
        closedBy: req.user._id,
        closedAt: new Date(),
      };
      await incident.save();
      if (mongooseSafe(incident.sourceRef)) {
        const scan = await ShelfScan.findById(incident.sourceRef);
        if (scan) {
          scan.reviews.push({
            index: -1,
            action: 'dismiss',
            note: input.reason,
            by: req.user._id,
            at: new Date(),
          });
          await scan.save();
        }
      }
      res.json(incident);
    }),
  );
  return router;
}
function mongooseSafe(value) {
  return /^[a-f\d]{24}$/i.test(value || '');
}
