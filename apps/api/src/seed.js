import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { readEnv } from './config/env.js';
import { Store, User, Product, Lot, Rule } from './models/index.js';
import { DEFAULT_RULE, DAY } from './rules/shelfLife.js';
export async function seed(password) {
  if (!password || password.length < 12)
    throw new Error('SEED_PASSWORD must have at least 12 characters.');
  const store = await Store.findOneAndUpdate(
    { name: 'Koramangala 04' },
    {
      $setOnInsert: {
        city: 'Bengaluru',
        location: { lat: 12.9352, lng: 77.6245 },
        fssaiLicenceNo: '10000000000000',
        isDemo: true,
        zones: [
          {
            zoneId: 'chiller-1',
            name: 'Dairy chiller',
            type: 'chilled',
            limits: { minC: 0, maxC: 5 },
          },
          {
            zoneId: 'frozen-1',
            name: 'Frozen room',
            type: 'frozen',
            limits: { minC: -25, maxC: -18 },
          },
          {
            zoneId: 'ambient-1',
            name: 'Ambient shelves',
            type: 'ambient',
            limits: { minC: 10, maxC: 30 },
          },
        ],
      },
    },
    { upsert: true, new: true },
  );
  const roles = ['manager', 'receiver', 'picker', 'area', 'admin'];
  for (let i = 0; i < roles.length; i++)
    await User.updateOne(
      { phone: `900000000${i + 1}` },
      {
        $setOnInsert: {
          name: [
            'Aditi Sharma',
            'Rahul Kumar',
            'Priya Patel',
            'Arjun Rao',
            'Demo Admin',
          ][i],
          role: roles[i],
          storeIds: [store._id],
          language: 'en',
          passwordHash: await bcrypt.hash(password, 10),
        },
      },
      { upsert: true },
    );
  const catalog = [
    ['Amul', 'Taaza milk', 3, 'chilled', 'Dairy'],
    ['Nandini', 'Set curd', 7, 'chilled', 'Dairy'],
    ['Britannia', 'Whole wheat bread', 5, 'ambient', 'Bakery'],
    ['Amul', 'UHT milk', 90, 'ambient', 'Dairy'],
    ['Parle', 'Glucose biscuits', 180, 'ambient', 'Snacks'],
    ['Mother Dairy', 'Paneer', 10, 'chilled', 'Dairy'],
    ['Safal', 'Green peas', 365, 'frozen', 'Frozen'],
    ['Tata Sampann', 'Toor dal', 365, 'ambient', 'Staples'],
    ['Aashirvaad', 'Whole wheat atta', 90, 'ambient', 'Staples'],
    ['Fortune', 'Sunflower oil', 270, 'ambient', 'Staples'],
    ['Maggi', 'Noodles', 270, 'ambient', 'Snacks'],
    ['Kissan', 'Tomato ketchup', 365, 'ambient', 'Condiments'],
    ['Amul', 'Butter', 365, 'chilled', 'Dairy'],
    ['McCain', 'French fries', 540, 'frozen', 'Frozen'],
    ['Vim', 'Dishwash liquid', 730, 'ambient', 'Household'],
  ];
  const products = [];
  for (let i = 0; i < 150; i++) {
    const [brand, name, shelfLifeDays, storageType, category] =
      catalog[i % catalog.length];
    products.push(
      await Product.findOneAndUpdate(
        { barcode: String(8900000000000 + i) },
        {
          $setOnInsert: {
            brand,
            name: `${brand} ${name} · pack ${Math.floor(i / 15) + 1}`,
            shelfLifeDays,
            storageType,
            category,
            isFood: category !== 'Household',
            isDemo: true,
          },
        },
        { upsert: true, new: true },
      ),
    );
  }
  const ruleEntries = [
    ['shelfLife', DEFAULT_RULE],
    ['thermal', { q10: 2, minMinutes: 10, maxGapMinutes: 5 }],
    ['dispatch', { etaBufferMin: 15, enforceFefo: true }],
    ['shelf', { scanEveryHours: 4, minConfidence: 0.6 }],
  ];
  for (const [key, params] of ruleEntries)
    await Rule.updateOne(
      { key, version: 'prototype-v1' },
      {
        $setOnInsert: {
          params,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          notes: 'Unverified prototype parameters. Mentor review required.',
        },
      },
      { upsert: true },
    );
  for (let i = 0; i < 12; i++) {
    const product = products[i],
      exp = new Date(
        Date.now() + (i === 2 ? -1 : product.shelfLifeDays * 0.7) * DAY,
      ),
      mfg = new Date(+exp - product.shelfLifeDays * DAY);
    await Lot.updateOne(
      { storeId: store._id, batchNo: `DEMO-${String(i + 1).padStart(3, '0')}` },
      {
        $setOnInsert: {
          productId: product._id,
          mfgDate: mfg,
          expDate: exp,
          effectiveExpDate: exp,
          qty: 12 + i * 3,
          zoneId:
            product.storageType === 'chilled'
              ? 'chiller-1'
              : product.storageType === 'frozen'
                ? 'frozen-1'
                : 'ambient-1',
          status: i === 2 ? 'rejected' : i === 5 ? 'quarantine' : 'accepted',
          ruleVersion: 'prototype-v1',
          isDemo: true,
        },
      },
      { upsert: true },
    );
  }
  return store;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = readEnv();
  try {
    await mongoose.connect(config.MONGO_URI);
    await seed(process.env.SEED_PASSWORD);
    console.log(
      'Seeded 1 synthetic store, 3 zones, 5 accounts, 150 products and 12 lots. Existing records preserved.',
    );
  } finally {
    await mongoose.disconnect();
  }
}
