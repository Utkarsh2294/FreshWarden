import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { seed } from '../apps/api/src/seed.js';
import { Product } from '../apps/api/src/models/index.js';
import { buildSnapshot } from '../apps/api/src/modules/reports/snapshot.js';
import { summaryFacts } from '../apps/api/src/modules/reports/summary.js';
import { renderAuditPdf } from '../apps/api/src/modules/reports/pdf.js';
const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri());
try {
  const store = await seed(randomBytes(16).toString('hex'));
  await Product.updateOne(
    { barcode: '8900000000001' },
    { $set: { name: 'नंदिनी दही / Nandini curd' } },
  );
  const snapshot = await buildSnapshot(store._id),
    result = await renderAuditPdf(snapshot, {
      summary: {
        lines: summaryFacts(snapshot)
          .slice(0, 4)
          .map((f) => f.text),
        provider: 'deterministic',
      },
    });
  await mkdir('.local/pdf', { recursive: true });
  await writeFile('.local/pdf/freshwarden-audit.pdf', result.buffer);
  await writeFile(
    '.local/pdf/freshwarden-snapshot.json',
    JSON.stringify(snapshot, null, 2),
  );
  console.log(
    JSON.stringify({
      file: '.local/pdf/freshwarden-audit.pdf',
      bytes: result.buffer.length,
      pdfHash: result.pdfHash,
      snapshotHash: snapshot.snapshotHash,
      source: 'real temporary MongoDB records seeded as synthetic demo',
    }),
  );
} finally {
  await mongoose.disconnect();
  await mongo.stop();
}
