import mongoose from 'mongoose';
const { Schema } = mongoose;
const id = { type: Schema.Types.ObjectId, required: true };
const model = (name, fields, indexes = []) => {
  const schema = new Schema(fields, { timestamps: true, strict: 'throw' });
  for (const [fields, options] of indexes) schema.index(fields, options);
  return mongoose.models[name] || mongoose.model(name, schema);
};
export const Store = model('Store', {
  name: { type: String, required: true },
  city: String,
  location: { lat: Number, lng: Number },
  fssaiLicenceNo: String,
  zones: [
    {
      zoneId: String,
      name: String,
      type: { type: String, enum: ['ambient', 'chilled', 'frozen'] },
      limits: { minC: Number, maxC: Number },
    },
  ],
  isDemo: Boolean,
});
export const User = model('User', {
  name: String,
  phone: { type: String, required: true, unique: true },
  role: {
    type: String,
    enum: ['receiver', 'picker', 'manager', 'area', 'inspector', 'admin'],
    required: true,
  },
  storeIds: [Schema.Types.ObjectId],
  language: { type: String, enum: ['en', 'hi'], default: 'en' },
  passwordHash: { type: String, required: true, select: false },
});
export const Product = model('Product', {
  barcode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  brand: String,
  category: String,
  shelfLifeDays: { type: Number, min: 1, required: true },
  storageType: {
    type: String,
    enum: ['ambient', 'chilled', 'frozen'],
    required: true,
  },
  allergens: [String],
  isFood: { type: Boolean, default: true },
  isDemo: Boolean,
});
export const Lot = model(
  'Lot',
  {
    storeId: id,
    productId: { ...id, ref: 'Product' },
    batchNo: String,
    inwardRecordId: { type: Schema.Types.ObjectId, unique: true, sparse: true },
    mfgDate: Date,
    expDate: Date,
    effectiveExpDate: Date,
    qty: { type: Number, min: 0, required: true },
    zoneId: String,
    status: {
      type: String,
      enum: ['accepted', 'quarantine', 'rejected', 'dispatched', 'discarded'],
      default: 'quarantine',
    },
    evidenceIds: [Schema.Types.ObjectId],
    createdBy: Schema.Types.ObjectId,
    ruleVersion: String,
    isDemo: Boolean,
  },
  [[{ storeId: 1, status: 1, effectiveExpDate: 1 }, {}]],
);
export const Rule = model(
  'Rule',
  {
    key: { type: String, required: true },
    version: { type: String, required: true },
    params: { type: Schema.Types.Mixed, required: true },
    effectiveFrom: { type: Date, required: true },
    notes: String,
  },
  [[{ key: 1, version: 1 }, { unique: true }]],
);
export const Evidence = model(
  'Evidence',
  {
    storeId: id,
    kind: String,
    sha256: { type: String, required: true },
    data: { type: Buffer, select: false },
    mimeType: String,
    takenAt: Date,
    takenBy: Schema.Types.ObjectId,
    meta: Schema.Types.Mixed,
  },
  [[{ sha256: 1 }, {}]],
);
export const LlmCall = model('LlmCall', {
  provider: String,
  model: String,
  purpose: String,
  latencyMs: Number,
  cacheHit: Boolean,
  ok: Boolean,
  error: String,
});
