import { Router } from 'express';
import { z } from 'zod';
import { InwardRecord } from './model.js';
import { Product, Store, Lot, Evidence } from '../../models/index.js';
import { objectId } from '../stores/routes.js';
import {
  requireAuth,
  requireRole,
  assertStore,
} from '../../middleware/auth.js';
import { route, fail } from '../../middleware/error.js';
import { getRule } from '../../rules/index.js';
import { labelInstant } from '../../rules/shelfLife.js';
import { decideInward } from './decision.js';
import { upload, saveEvidence } from './evidence.js';
import { labelExtractPrompt } from '../../llm/prompts/labelExtract.js';
import { labelSchema, labelJsonSchema } from '../../llm/schemas.js';
const fieldsInput = z
  .object({
    mfgDate: z.string().max(50).nullable().optional(),
    expDate: z.string().max(100).nullable().optional(),
    batchNo: z.string().max(80).nullable().optional(),
    fssaiNo: z.string().max(30).nullable().optional(),
    mrp: z.number().nonnegative().nullable().optional(),
    confidence: z.number().min(0).max(1).default(0),
  })
  .strict();
export function inwardRoutes(config, gateway) {
  const router = Router();
  router.use(requireAuth(config));
  router.get(
    '/evidence/:id',
    requireRole('receiver', 'manager', 'area'),
    route(async (req, res) => {
      const evidence = await Evidence.findById(
        objectId.parse(req.params.id),
      ).select('+data');
      if (!evidence) throw fail(404, 'NOT_FOUND', 'Evidence not found.');
      assertStore(req.user, evidence.storeId);
      res
        .set('Content-Type', evidence.mimeType)
        .set('Cache-Control', 'private, no-store')
        .send(evidence.data);
    }),
  );
  router.get(
    '/inward',
    requireRole('receiver', 'manager', 'area'),
    route(async (req, res) => {
      const storeId = objectId.parse(req.query.storeId);
      assertStore(req.user, storeId);
      res.json(
        await InwardRecord.find({ storeId })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean(),
      );
    }),
  );
  router.post(
    '/inward/verify',
    requireRole('receiver', 'manager'),
    upload,
    route(async (req, res) => {
      const input = z
        .object({
          storeId: objectId,
          zoneId: z.string().min(1).max(40),
          barcode: z.string().regex(/^\d{8,14}$/),
          requestId: z.string().uuid(),
          source: z.enum(['manual', 'ocr']).default('manual'),
          fields: z.string().max(4000),
        })
        .strict()
        .parse(req.body);
      assertStore(req.user, input.storeId);
      const existing = await InwardRecord.findOne({
        storeId: input.storeId,
        userId: req.user._id,
        requestId: input.requestId,
      }).lean();
      if (existing) return res.json(existing);
      let fields;
      try {
        fields = fieldsInput.parse(JSON.parse(input.fields));
      } catch {
        throw fail(400, 'INVALID_FIELDS', 'Check the label fields.');
      }
      const store = await Store.findById(input.storeId).lean(),
        zone = store?.zones.find((z) => z.zoneId === input.zoneId);
      if (!zone)
        throw fail(400, 'UNKNOWN_ZONE', 'Select an existing storage zone.');
      const product = await Product.findOne({ barcode: input.barcode }).lean();
      if (product && product.storageType !== zone.type)
        throw fail(
          400,
          'WRONG_ZONE',
          'Choose a zone matching the product storage type.',
        );
      const { evidence, buffer } = await saveEvidence({
        file: req.file,
        storeId: input.storeId,
        userId: req.user._id,
        kind: 'inward',
      });
      const rule = await getRule('shelfLife');
      let verdict = decideInward({
        fields,
        product,
        rule,
        source: input.source,
      });
      if (verdict.status === 'amber' && input.source === 'ocr') {
        const result = await gateway.image({
          buffer,
          purpose: 'label-v1',
          prompt: labelExtractPrompt,
          schema: labelSchema,
          jsonSchema: labelJsonSchema,
        });
        if (result.data)
          verdict = decideInward({
            fields: result.data,
            product,
            rule,
            source: 'gemini',
            ocr: fields,
          });
        else verdict.reasons.push(result.error || 'PROVIDER_FAILED');
      }
      const record = await InwardRecord.create({
        storeId: input.storeId,
        userId: req.user._id,
        evidenceId: evidence._id,
        productId: product?._id,
        zoneId: zone.zoneId,
        requestId: input.requestId,
        extracted: verdict.extracted,
        verdict,
        ruleVersion: rule.version,
      }).catch(async (error) => {
        if (error.code !== 11000) throw error;
        const saved = await InwardRecord.findOne({
          storeId: input.storeId,
          userId: req.user._id,
          requestId: input.requestId,
        });
        if (!saved) throw error;
        return saved;
      });
      res.status(201).json(record);
    }),
  );
  router.post(
    '/inward/:id/confirm',
    requireRole('receiver', 'manager'),
    route(async (req, res) => {
      const input = z
          .object({
            action: z.enum(['accept', 'reject', 'quarantine']),
            fields: fieldsInput.optional(),
          })
          .strict()
          .parse(req.body),
        record = await InwardRecord.findById(objectId.parse(req.params.id));
      if (!record) throw fail(404, 'NOT_FOUND', 'Scan not found.');
      assertStore(req.user, record.storeId);
      if (record.status !== 'pending') return res.json(record);
      if (input.fields && !['manager', 'admin'].includes(req.user.role))
        throw fail(
          403,
          'SUPERVISOR_REQUIRED',
          'A supervisor must correct the label.',
        );
      const product = record.productId
          ? await Product.findById(record.productId).lean()
          : null,
        rule = await getRule('shelfLife');
      const verdict = decideInward({
        fields: input.fields || record.extracted,
        product,
        rule,
        source: input.fields ? 'manual' : record.verdict.source,
      });
      if (input.action === 'accept') {
        if (
          verdict.status === 'red' ||
          verdict.reasons.includes('MFG_AFTER_EXP_CHECK_LABEL') ||
          !product
        )
          throw fail(
            409,
            'UNSAFE_LOT',
            'This item cannot be accepted. Correct the label or reject it.',
          );
        if (
          (verdict.status === 'amber' || record.verdict.status === 'amber') &&
          !['manager', 'admin'].includes(req.user.role)
        )
          throw fail(
            403,
            'SUPERVISOR_REQUIRED',
            'A supervisor must review this uncertain scan.',
          );
        if (
          !verdict.extracted.mfgDate ||
          !verdict.extracted.expDate ||
          !/^\d{14}$/.test(verdict.extracted.fssaiNo || '') ||
          typeof verdict.extracted.mrp !== 'number'
        )
          throw fail(
            409,
            'LABEL_INCOMPLETE',
            'Manufacture date, expiry, 14-digit licence and MRP are required.',
          );
      }
      // One conditional claim prevents duplicate confirmations from adding stock twice.
      const claimed = await InwardRecord.findOneAndUpdate(
        { _id: record._id, status: 'pending' },
        { $set: { status: 'confirming' } },
        { new: true },
      );
      if (!claimed)
        throw fail(
          409,
          'CONFIRM_IN_PROGRESS',
          'This scan is already being confirmed. Refresh its status.',
        );
      try {
        let lot;
        if (product)
          lot = await Lot.findOneAndUpdate(
            { inwardRecordId: record._id },
            {
              $setOnInsert: {
                storeId: record.storeId,
                productId: product._id,
                batchNo: verdict.extracted.batchNo || String(record._id),
                mfgDate: verdict.extracted.mfgDate
                  ? new Date(labelInstant(verdict.extracted.mfgDate))
                  : undefined,
                expDate: verdict.extracted.expDate
                  ? new Date(labelInstant(verdict.extracted.expDate, true))
                  : undefined,
                effectiveExpDate: verdict.extracted.expDate
                  ? new Date(labelInstant(verdict.extracted.expDate, true))
                  : undefined,
                qty: 1,
                zoneId: record.zoneId,
                status: {
                  accept: 'accepted',
                  reject: 'rejected',
                  quarantine: 'quarantine',
                }[input.action],
                evidenceIds: [record.evidenceId],
                createdBy: req.user._id,
                ruleVersion: rule.version,
              },
            },
            { new: true, upsert: true, runValidators: true },
          );
        const result = await InwardRecord.findByIdAndUpdate(
          record._id,
          {
            $set: {
              lotId: lot?._id,
              status: input.action,
              verdict,
              extracted: verdict.extracted,
              ruleVersion: rule.version,
              confirmation: {
                by: req.user._id,
                at: new Date(),
                action: input.action,
                fields: input.fields,
              },
            },
          },
          { new: true },
        );
        res.json(result);
      } catch (error) {
        await InwardRecord.updateOne(
          { _id: record._id, status: 'confirming' },
          { $set: { status: 'pending' } },
        );
        throw error;
      }
    }),
  );
  return router;
}
