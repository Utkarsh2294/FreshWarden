import { z } from 'zod';
export const findingTypes = [
  'EXPIRED_VISIBLE',
  'NEAR_EXPIRY',
  'MIXED_BATCH',
  'FEFO_VIOLATION',
  'FLOOR_CONTACT',
  'MOULD',
  'PEST',
  'DAMAGED_PACK',
  'WET_FLOOR',
  'OPEN_CARTON',
  'OTHER',
];
export const shelfSchema = z
  .object({
    photoQuality: z.enum(['good', 'poor']),
    poorReason: z.string().max(500),
    findings: z
      .array(
        z
          .object({
            type: z.enum(findingTypes),
            severity: z.number().int().min(1).max(3),
            note: z.string().max(500),
            confidence: z.number().min(0).max(1),
            region: z.string().max(100),
          })
          .strict(),
      )
      .max(100),
    overallImpression: z.string().max(1000),
  })
  .strict();
export const shelfJsonSchema = {
  type: 'object',
  properties: {
    photoQuality: { type: 'string', enum: ['good', 'poor'] },
    poorReason: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: findingTypes },
          severity: { type: 'integer', minimum: 1, maximum: 3 },
          note: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          region: { type: 'string' },
        },
        required: ['type', 'severity', 'note', 'confidence', 'region'],
      },
    },
    overallImpression: { type: 'string' },
  },
  required: ['photoQuality', 'poorReason', 'findings', 'overallImpression'],
};
export const dueForSeverity = (severity, now = new Date()) =>
  new Date(+now + ({ 1: 1440, 2: 240, 3: 30 }[severity] || 30) * 60000);
