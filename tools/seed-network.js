import mongoose from 'mongoose';
import { readEnv } from '../apps/api/src/config/env.js';
import { Store, User } from '../apps/api/src/models/index.js';
const config = readEnv();
await mongoose.connect(config.MONGO_URI);
try {
  const original = await Store.findOne({ name: 'Koramangala 04' }).lean();
  if (!original) throw new Error('Run the core seed first.');
  const points = [
    ['Indiranagar 02', 12.9784, 77.6408],
    ['HSR Layout 07', 12.9121, 77.6446],
    ['Whitefield 03', 12.9698, 77.75],
    ['Jayanagar 01', 12.925, 77.5938],
  ];
  for (const [name, lat, lng] of points)
    await Store.updateOne(
      { name },
      {
        $setOnInsert: {
          city: 'Bengaluru',
          location: { lat, lng },
          zones: original.zones.map((z) => ({
            zoneId: z.zoneId,
            name: z.name,
            type: z.type,
            limits: z.limits,
          })),
          isDemo: true,
        },
      },
      { upsert: true },
    );
  const stores = await Store.find({ isDemo: true }).select('_id').lean();
  await User.updateMany(
    { role: { $in: ['area', 'admin'] } },
    { $addToSet: { storeIds: { $each: stores.map((s) => s._id) } } },
  );
  console.log(
    `Network contains ${stores.length} synthetic stores. No readings, incidents, trends or health scores were fabricated.`,
  );
} finally {
  await mongoose.disconnect();
}
