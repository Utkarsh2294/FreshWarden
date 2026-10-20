import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../../models/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { fail, route } from '../../middleware/error.js';
import { addImportRoute } from './import.js';
export function catalogRoutes(config) {
  const router = Router();
  router.use(requireAuth(config));
  addImportRoute(router);
  router.get(
    '/catalog/lookup',
    route(async (req, res) => {
      const barcode = z
        .string()
        .regex(/^\d{8,14}$/)
        .parse(req.query.barcode);
      const product = await Product.findOne({ barcode }).lean();
      if (!product)
        throw fail(
          404,
          'UNKNOWN_BARCODE',
          'Barcode is not in the catalog. Request supervisor review.',
        );
      res.json(product);
    }),
  );
  return router;
}
