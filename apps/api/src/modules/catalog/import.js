import express from 'express';
import { parse } from 'csv-parse';
import { z } from 'zod';
import { Readable } from 'node:stream';
import { Product } from '../../models/index.js';
import { requireRole } from '../../middleware/auth.js';
import { route } from '../../middleware/error.js';
export const productInput = z.object({
  barcode: z.string().regex(/^\d{8,14}$/),
  name: z.string().min(1).max(150),
  brand: z.string().max(100).default(''),
  category: z.string().max(100).default(''),
  shelfLifeDays: z.coerce.number().int().min(1).max(3650),
  storageType: z.enum(['ambient', 'chilled', 'frozen']),
  isFood: z.enum(['true', 'false']).transform((v) => v === 'true'),
});
export function addImportRoute(router) {
  router.post(
    '/catalog/import',
    requireRole('admin'),
    express.text({ type: 'text/csv', limit: '1mb' }),
    route(async (req, res) => {
      const csv = z.string().min(1).max(1048576).parse(req.body),
        errors = [];
      let inserted = 0,
        row = 1;
      const parser = Readable.from([csv]).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          bom: true,
          max_record_size: 4096,
          trim: true,
        }),
      );
      try {
        for await (const record of parser) {
          row++;
          const result = productInput.safeParse(record);
          if (!result.success) {
            errors.push({
              row,
              message: result.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; '),
            });
            continue;
          }
          try {
            await Product.create(result.data);
            inserted++;
          } catch (error) {
            if (error.code === 11000)
              errors.push({ row, message: 'Duplicate barcode' });
            else throw error;
          }
        }
      } catch (error) {
        if (error.code?.startsWith('CSV_'))
          return res.status(400).json({
            error: { code: 'INVALID_CSV', message: 'CSV is malformed.' },
            inserted,
            errors,
          });
        throw error;
      }
      res.json({ inserted, errors });
    }),
  );
}
