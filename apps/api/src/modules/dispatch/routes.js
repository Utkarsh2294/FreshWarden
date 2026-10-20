import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Lot } from '../../models/index.js';
import { Incident } from '../incidents/model.js';
import { DispatchOrder } from './models.js';
import { checkItems, recordCheck } from './service.js';
import {
  requireAuth,
  requireRole,
  assertStore,
} from '../../middleware/auth.js';
import { route, fail } from '../../middleware/error.js';
import { objectId } from '../stores/routes.js';
const orderKey = { storeId: objectId, orderId: z.string().min(1).max(80) };
export function dispatchRoutes(config) {
  const router = Router();
  router.use(requireAuth(config));
  router.post(
    '/dispatch/check',
    requireRole('picker', 'manager'),
    route(async (req, res) => {
      const input = z
        .object({
          ...orderKey,
          etaMinutes: z.number().int().min(0).max(180).default(15),
          items: z
            .array(
              z
                .object({
                  lotId: objectId,
                  qty: z.number().int().min(1).max(1000),
                })
                .strict(),
            )
            .min(1)
            .max(50),
        })
        .strict()
        .parse(req.body);
      assertStore(req.user, input.storeId);
      // Aggregate duplicate lot rows before stock validation and reservation.
      const totals = new Map();
      for (const item of input.items)
        totals.set(item.lotId, (totals.get(item.lotId) || 0) + item.qty);
      input.items = [...totals].map(([lotId, qty]) => ({ lotId, qty }));
      const existing = await DispatchOrder.findOne({
        storeId: input.storeId,
        orderId: input.orderId,
      });
      if (existing?.status === 'packed')
        throw fail(409, 'ORDER_PACKED', 'This order is already packed.');
      const started = performance.now(),
        result = await checkItems(input),
        order = await DispatchOrder.findOneAndUpdate(
          {
            storeId: input.storeId,
            orderId: input.orderId,
            status: { $ne: 'packed' },
          },
          {
            $set: {
              ...input,
              result,
              status: result.blocked ? 'blocked' : 'checked',
            },
            $unset: { override: '' },
            $inc: { revision: 1 },
          },
          { upsert: true, new: true },
        );
      await recordCheck({
        ...input,
        userId: req.user._id,
        result,
        latencyMs: performance.now() - started,
      });
      res.json({ ...result, orderId: order.orderId, revision: order.revision });
    }),
  );
  router.post(
    '/dispatch/override',
    requireRole('manager'),
    route(async (req, res) => {
      const input = z
        .object({ ...orderKey, reason: z.string().min(15).max(500) })
        .strict()
        .parse(req.body);
      assertStore(req.user, input.storeId);
      const order = await DispatchOrder.findOne({
        storeId: input.storeId,
        orderId: input.orderId,
        status: 'blocked',
      });
      if (!order) throw fail(404, 'NOT_FOUND', 'Blocked order not found.');
      if (
        order.result.items.some((i) =>
          i.reasons.some(
            (r) => !['FEFO_REQUIRED', 'NEAR_THRESHOLD'].includes(r.code),
          ),
        )
      )
        throw fail(
          409,
          'HARD_BLOCK',
          'Expiry, quarantine, stock and temperature blocks cannot be overridden.',
        );
      order.override = {
        by: req.user._id,
        reason: input.reason,
        at: new Date(),
      };
      order.status = 'checked';
      await order.save();
      await Incident.create({
        storeId: order.storeId,
        type: 'OVERRIDE',
        severity: 2,
        summary: input.reason,
        sourceRef: String(order._id),
        owner: req.user._id,
        dueAt: new Date(),
      });
      res.json(order);
    }),
  );
  router.post(
    '/dispatch/pack',
    requireRole('picker', 'manager'),
    route(async (req, res) => {
      const input = z
        .object({
          ...orderKey,
          revision: z.number().int().min(1),
          foodBagId: z.string().min(1).max(80),
          nonFoodBagId: z.string().max(80).optional(),
        })
        .strict()
        .parse(req.body);
      assertStore(req.user, input.storeId);
      const session = await mongoose.startSession();
      let packed;
      try {
        await session.withTransaction(async () => {
          const order = await DispatchOrder.findOne({
            storeId: input.storeId,
            orderId: input.orderId,
          }).session(session);
          if (!order)
            throw fail(404, 'NOT_FOUND', 'Check this order before packing.');
          if (order.status === 'packed') {
            packed = order;
            return;
          }
          if (order.status !== 'checked' || order.revision !== input.revision)
            throw fail(
              409,
              'ORDER_CHANGED',
              'The order changed or was blocked. Run its checks again.',
            );
          const current = await checkItems({
            storeId: order.storeId,
            items: order.items,
            etaMinutes: order.etaMinutes,
            session,
            allowFefoOverride: !!order.override,
          });
          if (current.blocked)
            throw fail(
              409,
              'SAFETY_RECHECK_FAILED',
              'Stock or safety changed. Check the order again.',
            );
          const mixed =
            current.items.some((i) => i.isFood) &&
            current.items.some((i) => !i.isFood);
          if (
            mixed &&
            (!input.nonFoodBagId || input.nonFoodBagId === input.foodBagId)
          )
            throw fail(
              400,
              'SEPARATE_BAGS_REQUIRED',
              'Use different bag IDs for food and non-food items.',
            );
          for (const item of order.items) {
            const changed = await Lot.findOneAndUpdate(
              {
                _id: item.lotId,
                storeId: order.storeId,
                status: 'accepted',
                qty: { $gte: item.qty },
              },
              { $inc: { qty: -item.qty } },
              { new: true, session },
            );
            if (!changed)
              throw fail(
                409,
                'STOCK_CHANGED',
                'Another picker has used the stock. Check again.',
              );
          }
          order.status = 'packed';
          order.foodBagId = input.foodBagId;
          order.nonFoodBagId = input.nonFoodBagId;
          order.packedAt = new Date();
          order.packedBy = req.user._id;
          order.result = current;
          await order.save({ session });
          packed = order;
        });
      } finally {
        await session.endSession();
      }
      res.json(packed);
    }),
  );
  return router;
}
