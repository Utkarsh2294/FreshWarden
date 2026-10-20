import { Router } from 'express';
import { z } from 'zod';
import { Store, Lot, Product } from '../../models/index.js';
import {
  requireAuth,
  assertStore,
  requireRole,
} from '../../middleware/auth.js';
import { fail, route } from '../../middleware/error.js';
import { addSettingsRoutes } from './settings.js';
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export function storeRoutes(config) {
  const router = Router();
  router.use(requireAuth(config));
  addSettingsRoutes(router);
  router.get(
    '/stores',
    route(async (req, res) =>
      res.json(
        await Store.find(
          req.user.role === 'admin' ? {} : { _id: { $in: req.user.storeIds } },
        ).lean(),
      ),
    ),
  );
  router.get(
    '/stores/:id/overview',
    route(async (req, res) => {
      const storeId = objectId.parse(req.params.id);
      assertStore(req.user, storeId);
      const store = await Store.findById(storeId).lean();
      if (!store) throw fail(404, 'NOT_FOUND', 'Store not found.');
      const lots = await Lot.find({ storeId })
        .populate('productId')
        .sort({ effectiveExpDate: 1 })
        .limit(100)
        .lean();
      res.json({
        store,
        lots,
        productCount: await Product.countDocuments(),
        phase: 1,
      });
    }),
  );
  router.get(
    '/lots',
    requireRole('receiver', 'picker', 'manager', 'area'),
    route(async (req, res) => {
      const storeId = objectId.parse(req.query.storeId);
      assertStore(req.user, storeId);
      res.json(
        await Lot.find({ storeId })
          .populate('productId')
          .sort({ effectiveExpDate: 1 })
          .limit(200)
          .lean(),
      );
    }),
  );
  return router;
}
