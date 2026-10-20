import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import mongoose from 'mongoose';
import { readEnv } from '../../apps/api/src/config/env.js';
import { createGateway } from '../../apps/api/src/llm/gateway.js';
import {
  labelSchema,
  labelJsonSchema,
} from '../../apps/api/src/llm/schemas.js';
import { labelExtractPrompt } from '../../apps/api/src/llm/prompts/labelExtract.js';
import { decideInward } from '../../apps/api/src/modules/inward/decision.js';
import { Product } from '../../apps/api/src/models/index.js';
import { getRule } from '../../apps/api/src/rules/index.js';
const dataset = path.resolve('datasets/inward'),
  truth = path.join(dataset, 'truth.csv');
let records;
try {
  records = parse(await readFile(truth, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
} catch {
  console.error(
    'NOT RUN: supply datasets/inward/truth.csv and real labelled pack photos. No accuracy or false-accept metric is available.',
  );
  process.exitCode = 1;
}
if (records) {
  const config = readEnv();
  if (!config.GEMINI_API_KEY || !config.GEMINI_VISION_MODEL)
    throw new Error(
      'A configured live vision provider is required for photo evaluation.',
    );
  await mongoose.connect(config.MONGO_URI);
  try {
    const gateway = createGateway(config),
      rule = await getRule('shelfLife'),
      results = [];
    for (const row of records) {
      const photo = path.resolve(dataset, row.filename);
      if (!photo.startsWith(dataset + path.sep))
        throw new Error('Photo path must stay within dataset.');
      const buffer = await readFile(photo),
        start = performance.now();
      const vision = await gateway.image({
        buffer,
        mimeType: row.mimeType || 'image/jpeg',
        purpose: 'inward-eval-v1',
        prompt: labelExtractPrompt,
        schema: labelSchema,
        jsonSchema: labelJsonSchema,
      });
      const product = await Product.findOne({ barcode: row.barcode }).lean();
      const verdict = decideInward({
        fields: vision.data || { confidence: 0 },
        product,
        rule,
        now: row.evaluatedAt,
        source: 'gemini',
      });
      results.push({
        filename: row.filename,
        dateMatch: verdict.extracted.expDate === row.expDate,
        status: verdict.status,
        falseAccept:
          row.expectedVerdict !== 'green' && verdict.status === 'green',
        providerOk: !!vision.data,
        latencyMs: performance.now() - start,
      });
    }
    const n = results.length,
      latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b),
      percent = (predicate) =>
        n
          ? `${((results.filter(predicate).length / n) * 100).toFixed(1)}%`
          : 'not available',
      p = (q) =>
        n
          ? `${latencies[Math.min(n - 1, Math.ceil(n * q) - 1)].toFixed(0)} ms`
          : 'not available';
    const report = `# Inward photo evaluation\n\nMeasured ${new Date().toISOString()}. Dataset size: ${n} real labelled photos supplied by operator. Vision-only fallback path; browser OCR share is not measured here. Ground-truth dates are used only for scoring, never as model input.\n\n| Metric | Measured value |\n|---|---|\n| Date exact match | ${percent((r) => r.dateMatch)} |\n| Amber rate | ${percent((r) => r.status === 'amber')} |\n| False accepts | ${n ? results.filter((r) => r.falseAccept).length : 'not available'} |\n| Successful vision responses | ${percent((r) => r.providerOk)} |\n| p50 | ${p(0.5)} |\n| p95 | ${p(0.95)} |\n\nThis does not establish regulatory approval or hardware validation. Minimum 30-photo phase-2 acceptance: ${n >= 30 && results.every((r) => !r.falseAccept) ? 'passed on this dataset' : 'not met'}.\n`;
    await mkdir('docs/evaluation', { recursive: true });
    await writeFile(
      'docs/evaluation/inward-results.json',
      JSON.stringify(results, null, 2),
    );
    await writeFile('docs/eval.md', report);
    console.log(report);
    if (n < 30 || results.some((r) => r.falseAccept)) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
