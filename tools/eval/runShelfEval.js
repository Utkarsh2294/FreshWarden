import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { readEnv } from '../../apps/api/src/config/env.js';
import { createGateway } from '../../apps/api/src/llm/gateway.js';
import {
  shelfSchema,
  shelfJsonSchema,
  findingTypes,
} from '../../apps/api/src/modules/shelf/schema.js';
import { shelfAuditPrompt } from '../../apps/api/src/llm/prompts/shelfAudit.js';
const root = path.resolve('datasets/shelf');
let truth;
try {
  truth = JSON.parse(await readFile(path.join(root, 'truth.json'), 'utf8'));
} catch {
  console.error(
    'NOT RUN: provide 40 staged shelf photos and datasets/shelf/truth.json. Precision and recall are unavailable.',
  );
  process.exitCode = 1;
}
if (truth) {
  if (!Array.isArray(truth) || !truth.length)
    throw new Error('Truth must be a nonempty array.');
  const config = readEnv();
  if (!config.GEMINI_API_KEY || !config.GEMINI_VISION_MODEL)
    throw new Error('Configure a live vision provider.');
  await mongoose.connect(config.MONGO_URI);
  try {
    const gateway = createGateway(config),
      counts = Object.fromEntries(
        findingTypes.map((t) => [t, { tp: 0, fp: 0, fn: 0 }]),
      ),
      results = [];
    for (const row of truth) {
      const file = path.resolve(root, row.filename);
      if (!file.startsWith(root + path.sep))
        throw new Error('Photo must be inside shelf dataset.');
      const started = performance.now(),
        response = await gateway.image({
          buffer: await readFile(file),
          mimeType: row.mimeType || 'image/jpeg',
          purpose: 'shelf-eval-v1',
          prompt: shelfAuditPrompt,
          schema: shelfSchema,
          jsonSchema: shelfJsonSchema,
        });
      const expected = new Set(row.types),
        predicted = new Set(
          response.data?.findings
            .filter((f) => f.confidence >= 0.6)
            .map((f) => f.type) || [],
        );
      for (const type of findingTypes) {
        if (predicted.has(type) && expected.has(type)) counts[type].tp++;
        else if (predicted.has(type)) counts[type].fp++;
        else if (expected.has(type)) counts[type].fn++;
      }
      results.push({
        filename: row.filename,
        providerOk: !!response.data,
        qualityCorrect: response.data?.photoQuality === row.photoQuality,
        latencyMs: performance.now() - started,
        cacheHit: !!response.cacheHit,
      });
    }
    const summary = {
      measuredAt: new Date().toISOString(),
      datasetSize: truth.length,
      counts,
      results,
      metricScope:
        'One gateway invocation per image. Provider request count can be zero on a cache hit. No object detection metric is claimed.',
    };
    await mkdir('docs/evaluation', { recursive: true });
    await writeFile(
      'docs/evaluation/shelf-results.json',
      JSON.stringify(summary, null, 2),
    );
    console.table(
      findingTypes.map((type) => ({
        type,
        precision:
          counts[type].tp + counts[type].fp
            ? counts[type].tp / (counts[type].tp + counts[type].fp)
            : 'not available',
        recall:
          counts[type].tp + counts[type].fn
            ? counts[type].tp / (counts[type].tp + counts[type].fn)
            : 'not available',
      })),
    );
    console.log(
      `Dataset: ${truth.length}; successful provider responses: ${results.filter((r) => r.providerOk).length}.`,
    );
    if (truth.length < 40) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
