import { z } from 'zod';
import { Store, Rule } from '../../models/index.js';
import { requireRole, assertStore } from '../../middleware/auth.js';
import { route, fail } from '../../middleware/error.js';
import { clearRuleCache } from '../../rules/index.js';
const zoneInput = z.object({
  zoneId: z.string().regex(/^[a-z\d-]{1,40}$/),
  name: z.string().min(1).max(100),
  type: z.enum(['ambient', 'chilled', 'frozen']),
  limits: z
    .object({
      minC: z.number().min(-40).max(80),
      maxC: z.number().min(-40).max(80),
    })
    .refine((v) => v.minC < v.maxC, 'Minimum must be less than maximum'),
});
export function addSettingsRoutes(router) {
  router.post(
    '/stores',
    requireRole('admin'),
    route(async (req, res) => {
      const input = z
        .object({
          name: z.string().min(1).max(100),
          city: z.string().min(1).max(100),
          fssaiLicenceNo: z.string().regex(/^\d{14}$/),
          zones: z.array(zoneInput).min(1).max(30),
        })
        .strict()
        .parse(req.body);
      res.status(201).json(await Store.create(input));
    }),
  );
  router.patch(
    '/stores/:id/zones/:zoneId',
    requireRole('manager'),
    route(async (req, res) => {
      const storeId = z
        .string()
        .regex(/^[a-f\d]{24}$/i)
        .parse(req.params.id);
      assertStore(req.user, storeId);
      const input = zoneInput.parse(req.body);
      if (input.zoneId !== req.params.zoneId)
        throw fail(400, 'ZONE_MISMATCH', 'Zone identifier cannot change.');
      const store = await Store.findOneAndUpdate(
        { _id: storeId, 'zones.zoneId': input.zoneId },
        { $set: { 'zones.$': input } },
        { new: true, runValidators: true },
      );
      if (!store) throw fail(404, 'NOT_FOUND', 'Zone not found.');
      res.json(store);
    }),
  );
  router.get(
    '/rules',
    requireRole('manager', 'area'),
    route(async (_req, res) =>
      res.json(await Rule.find().sort({ effectiveFrom: -1 }).lean()),
    ),
  );
  router.post(
    '/rules',
    requireRole('admin'),
    route(async (req, res) => {
      const params = z.object({
        minPercent: z.number().min(0).max(100),
        minDays: z.number().min(0).max(3650),
        mode: z.enum(['either', 'both']),
        warnPercent: z.number().min(0).max(100),
      });
      const input = z
        .object({
          key: z.literal('shelfLife'),
          version: z.string().min(1).max(40),
          params,
          effectiveFrom: z.string().datetime(),
          notes: z.string().min(10).max(1000),
        })
        .strict()
        .parse(req.body);
      const rule = await Rule.create(input);
      clearRuleCache();
      res.status(201).json(rule);
    }),
  );
}
