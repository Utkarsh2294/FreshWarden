import mongoose from 'mongoose';
const { Schema } = mongoose;
const item = { lotId: Schema.Types.ObjectId, qty: Number };
const orderSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: String, required: true },
    items: [item],
    etaMinutes: Number,
    status: {
      type: String,
      enum: ['checked', 'blocked', 'packed'],
      default: 'blocked',
    },
    revision: { type: Number, default: 0 },
    result: Schema.Types.Mixed,
    override: { by: Schema.Types.ObjectId, reason: String, at: Date },
    foodBagId: String,
    nonFoodBagId: String,
    packedAt: Date,
    packedBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);
orderSchema.index({ storeId: 1, orderId: 1 }, { unique: true });
export const DispatchOrder =
  mongoose.models.DispatchOrder || mongoose.model('DispatchOrder', orderSchema);
const checkSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, required: true },
    orderId: String,
    userId: Schema.Types.ObjectId,
    items: Schema.Types.Mixed,
    ruleVersion: String,
    blocked: Boolean,
    latencyMs: Number,
  },
  { timestamps: true },
);
checkSchema.index({ storeId: 1, createdAt: -1 });
export const DispatchCheck =
  mongoose.models.DispatchCheck || mongoose.model('DispatchCheck', checkSchema);
