import mongoose from 'mongoose';
const { Schema } = mongoose;
const sensorSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, required: true },
    zoneId: { type: String, required: true },
    deviceId: { type: String, required: true, unique: true },
    keyHash: { type: String, required: true, select: false },
    lastSeenAt: Date,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const Sensor =
  mongoose.models.Sensor || mongoose.model('Sensor', sensorSchema);
const readingSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, required: true },
    zoneId: String,
    deviceId: String,
    readingKey: { type: String, required: true, unique: true },
    ts: { type: Date, required: true },
    receivedAt: Date,
    tempC: Number,
    humidity: Number,
    doorOpen: Boolean,
    isDemo: Boolean,
  },
  { timestamps: false },
);
// A regular TTL collection permits atomic replay protection; time-series unique indexes do not.
readingSchema.index({ ts: 1 }, { expireAfterSeconds: 30 * 86400 });
readingSchema.index({ storeId: 1, zoneId: 1, ts: -1 });
export const Reading =
  mongoose.models.Reading || mongoose.model('Reading', readingSchema);
const excursionSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, required: true },
    zoneId: String,
    startedAt: Date,
    endedAt: Date,
    peakC: Number,
    minutesOutside: Number,
    affectedLotIds: [Schema.Types.ObjectId],
    debitDays: { type: Number, default: 0 },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    ruleVersion: String,
    isDemo: Boolean,
  },
  { timestamps: true },
);
excursionSchema.index(
  { storeId: 1, zoneId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);
export const Excursion =
  mongoose.models.Excursion || mongoose.model('Excursion', excursionSchema);
