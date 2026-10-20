import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    zoneId: String,
    type: { type: String, required: true },
    severity: { type: Number, min: 1, max: 3, required: true },
    summary: String,
    sourceRef: String,
    evidenceId: mongoose.Schema.Types.ObjectId,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueAt: Date,
    status: {
      type: String,
      enum: ['open', 'in_progress', 'closed', 'dismissed'],
      default: 'open',
    },
    capa: {
      action: String,
      closedAt: Date,
      closedBy: mongoose.Schema.Types.ObjectId,
      proofImageId: mongoose.Schema.Types.ObjectId,
    },
    dedupeKey: { type: String, unique: true, sparse: true },
    isDemo: Boolean,
  },
  { timestamps: true },
);
schema.index({ storeId: 1, status: 1, dueAt: 1 });
export const Incident =
  mongoose.models.Incident || mongoose.model('Incident', schema);
