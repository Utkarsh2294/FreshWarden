import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { Store, Evidence } from '../../models/index.js';
import { InspectorLink, AuditReport, HealthSnapshot } from './models.js';
import { buildSnapshot, indiaDate } from './snapshot.js';
import { renderAuditPdf } from './pdf.js';
import { reportSummary } from './summary.js';
import {
  requireAuth,
  requireRole,
  assertStore,
} from '../../middleware/auth.js';
import { route, fail } from '../../middleware/error.js';
import { objectId } from '../stores/routes.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function inspectorAccess(raw) {
  const token = z
      .string()
      .regex(/^[a-f\d]{64}$/)
      .parse(raw),
    link = await InspectorLink.findOne({
      tokenHash: hash(token),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
  if (!link)
    throw fail(
      404,
      'LINK_UNAVAILABLE',
      'This inspection link expired or was revoked.',
    );
  await InspectorLink.updateOne(
    { _id: link._id },
    { $inc: { accessCount: 1 }, $set: { lastAccessedAt: new Date() } },
  );
  return link;
}
export function publicInspectorRoutes() {
  const router = Router();
  router.get(
    '/inspector/:token([a-f0-9]{64})',
    route(async (req, res) => {
      const link = await inspectorAccess(req.params.token),
        snapshot = await buildSnapshot(link.storeId);
      res
        .set('Cache-Control', 'private, no-store')
        .json({ snapshot, expiresAt: link.expiresAt, readOnly: true });
    }),
  );
  router.get(
    '/inspector/:token([a-f0-9]{64})/evidence/:id',
    route(async (req, res) => {
      const link = await inspectorAccess(req.params.token),
        evidence = await Evidence.findOne({
          _id: objectId.parse(req.params.id),
          storeId: link.storeId,
        }).select('+data');
      if (!evidence) throw fail(404, 'NOT_FOUND', 'Evidence not found.');
      res
        .set('Content-Type', evidence.mimeType)
        .set('Cache-Control', 'private, no-store')
        .send(evidence.data);
    }),
  );
  return router;
}
export function reportRoutes(config, gateway) {
  const router = Router();
  router.use(requireAuth(config));
  router.get(
    '/stores/:id/health',
    requireRole('manager', 'area'),
    route(async (req, res) => {
      const storeId = objectId.parse(req.params.id);
      assertStore(req.user, storeId);
      res.json(
        await buildSnapshot(
          storeId,
          z.string().optional().parse(req.query.date) || indiaDate(),
        ),
      );
    }),
  );
  router.get(
    '/network/health',
    requireRole('area'),
    route(async (req, res) => {
      const stores = await Store.find(
          req.user.role === 'admin' ? {} : { _id: { $in: req.user.storeIds } },
        ).lean(),
        items = [];
      for (const store of stores) {
        const snapshot = await buildSnapshot(store._id);
        items.push({
          store: snapshot.store,
          health: snapshot.health,
          counts: snapshot.counts,
          coverageComplete: snapshot.coverageComplete,
        });
      }
      res.json({
        items,
        trends: await HealthSnapshot.find({
          storeId: { $in: stores.map((s) => s._id) },
          date: { $gte: indiaDate(new Date(Date.now() - 30 * 86400000)) },
        })
          .sort({ date: 1 })
          .lean(),
      });
    }),
  );
  router.get(
    '/reports/daily',
    requireRole('manager', 'area'),
    route(async (req, res) => {
      const storeId = objectId.parse(req.query.storeId);
      assertStore(req.user, storeId);
      const snapshot = await buildSnapshot(
          storeId,
          z.string().optional().parse(req.query.date) || indiaDate(),
        ),
        summary = await reportSummary(snapshot, gateway),
        evidence = await Evidence.find({
          _id: { $in: snapshot.evidence.slice(0, 6).map((e) => e._id) },
        }).select('+data');
      const { buffer, pdfHash } = await renderAuditPdf(snapshot, {
        summary,
        photos: evidence.map((e) => ({
          id: e._id,
          kind: e.kind,
          buffer: e.data,
        })),
      });
      await AuditReport.create({
        storeId,
        date: snapshot.date,
        snapshotHash: snapshot.snapshotHash,
        pdfHash,
        ruleVersions: snapshot.rules.map((r) => `${r.key}:${r.version}`),
        generatedBy: req.user._id,
        summaryProvider: summary.provider,
      });
      res
        .set('Content-Type', 'application/pdf')
        .set(
          'Content-Disposition',
          `attachment; filename="freshwarden-${snapshot.date}.pdf"`,
        )
        .set('X-Report-SHA256', pdfHash)
        .set('Cache-Control', 'private, no-store')
        .send(buffer);
    }),
  );
  router.get(
    '/inspector/links',
    requireRole('manager'),
    route(async (req, res) => {
      const storeId = objectId.parse(req.query.storeId);
      assertStore(req.user, storeId);
      res.json(
        await InspectorLink.find({ storeId })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),
      );
    }),
  );
  router.post(
    '/inspector/links',
    requireRole('manager'),
    route(async (req, res) => {
      const input = z
        .object({
          storeId: objectId,
          hours: z.number().int().min(1).max(24).default(24),
        })
        .strict()
        .parse(req.body);
      assertStore(req.user, input.storeId);
      const token = randomBytes(32).toString('hex'),
        expiresAt = new Date(Date.now() + input.hours * 3600000),
        link = await InspectorLink.create({
          storeId: input.storeId,
          tokenHash: hash(token),
          expiresAt,
          createdBy: req.user._id,
        });
      res.status(201).json({
        id: link._id,
        url: `${config.CLIENT_ORIGIN}/inspect/${token}`,
        expiresAt,
      });
    }),
  );
  router.delete(
    '/inspector/links/:id',
    requireRole('manager'),
    route(async (req, res) => {
      const link = await InspectorLink.findById(objectId.parse(req.params.id));
      if (!link) throw fail(404, 'NOT_FOUND', 'Link not found.');
      assertStore(req.user, link.storeId);
      link.revokedAt = new Date();
      await link.save();
      res.json({ revoked: true });
    }),
  );
  return router;
}
