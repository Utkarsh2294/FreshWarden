import mongoose from 'mongoose';
const { Schema } = mongoose;
const auditSchema = new Schema(
  {
    storeId: Schema.Types.ObjectId,
    date: String,
    snapshotHash: String,
    pdfHash: String,
    ruleVersions: [String],
    generatedBy: Schema.Types.ObjectId,
    summaryProvider: String,
  },
  { timestamps: true },
);
export const AuditReport =
  mongoose.models.AuditReport || mongoose.model('AuditReport', auditSchema);
const inspectorSchema = new Schema(
  {
    storeId: Schema.Types.ObjectId,
    tokenHash: { type: String, unique: true, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    createdBy: Schema.Types.ObjectId,
    accessCount: { type: Number, default: 0 },
    lastAccessedAt: Date,
  },
  { timestamps: true },
);
export const InspectorLink =
  mongoose.models.InspectorLink ||
  mongoose.model('InspectorLink', inspectorSchema);
const healthSchema = new Schema(
  {
    storeId: Schema.Types.ObjectId,
    date: String,
    score: Number,
    status: String,
    coverageComplete: Boolean,
  },
  { timestamps: true },
);
healthSchema.index({ storeId: 1, date: 1 }, { unique: true });
export const HealthSnapshot =
  mongoose.models.HealthSnapshot ||
  mongoose.model('HealthSnapshot', healthSchema);
