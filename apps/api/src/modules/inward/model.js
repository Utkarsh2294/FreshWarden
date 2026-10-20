import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot' },
    userId: mongoose.Schema.Types.ObjectId,
    evidenceId: mongoose.Schema.Types.ObjectId,
    productId: mongoose.Schema.Types.ObjectId,
    zoneId: String,
    requestId: String,
    verdict: mongoose.Schema.Types.Mixed,
    extracted: mongoose.Schema.Types.Mixed,
    ruleVersion: String,
    status: { type: String, default: 'pending' },
    confirmation: {
      by: mongoose.Schema.Types.ObjectId,
      at: Date,
      action: String,
      fields: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);
schema.index({ storeId: 1, userId: 1, requestId: 1 }, { unique: true });
export const InwardRecord =
  mongoose.models.InwardRecord || mongoose.model('InwardRecord', schema);
