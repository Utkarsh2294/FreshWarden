import { z } from 'zod';
const nullableText = z.string().max(500).nullable();
export const labelSchema = z
  .object({
    productName: nullableText,
    brand: nullableText,
    batchNo: nullableText,
    mfgDate: nullableText,
    expDate: nullableText,
    bestBeforeText: nullableText,
    mrp: z.number().nonnegative().nullable(),
    fssaiNo: nullableText,
    confidence: z.number().min(0).max(1),
    fieldsUnreadable: z.array(z.string().max(100)).max(30),
    notes: z.string().max(1000),
  })
  .strict();
export const labelJsonSchema = {
  type: 'object',
  properties: {
    productName: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    batchNo: { type: ['string', 'null'] },
    mfgDate: { type: ['string', 'null'] },
    expDate: { type: ['string', 'null'] },
    bestBeforeText: { type: ['string', 'null'] },
    mrp: { type: ['number', 'null'] },
    fssaiNo: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    fieldsUnreadable: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: [
    'productName',
    'brand',
    'batchNo',
    'mfgDate',
    'expDate',
    'bestBeforeText',
    'mrp',
    'fssaiNo',
    'confidence',
    'fieldsUnreadable',
    'notes',
  ],
};
