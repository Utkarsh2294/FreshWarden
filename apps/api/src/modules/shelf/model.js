import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    zoneId: String,
    evidenceId: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
    sha256: String,
    result: mongoose.Schema.Types.Mixed,
    status: String,
    score: Number,
    ruleVersion: String,
    reviews: [
      {
        index: Number,
        action: String,
        note: String,
        by: mongoose.Schema.Types.ObjectId,
        at: Date,
      },
    ],
  },
  { timestamps: true },
);
schema.index({ storeId: 1, zoneId: 1, sha256: 1 }, { unique: true });
export const ShelfScan =
  mongoose.models.ShelfScan || mongoose.model('ShelfScan', schema);
