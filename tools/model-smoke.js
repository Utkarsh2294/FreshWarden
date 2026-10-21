import sharp from 'sharp';
import { z } from 'zod';
import { createGateway } from '../apps/api/src/llm/gateway.js';
const config = process.env;
for (const key of [
  'GEMINI_API_KEY',
  'GEMINI_VISION_MODEL',
  'GROQ_API_KEY',
  'GROQ_TEXT_MODEL',
])
  if (!config[key])
    throw new Error(
      `Missing ${key}. Configure the opt-in smoke workflow first.`,
    );
const gateway = createGateway(config, { audit: async () => {}, retries: 0 });
const schema = z.object({ ok: z.boolean() }).strict();
const buffer = await sharp({
  create: { width: 8, height: 8, channels: 3, background: '#fff' },
})
  .jpeg()
  .toBuffer();
const image = await gateway.image({
  buffer,
  prompt: 'Return only {"ok":true} as JSON.',
  purpose: 'configured-model-smoke',
  schema,
  jsonSchema: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
  },
});
const text = await gateway.text({
  system: 'Return only {"ok":true} as JSON.',
  user: 'Connectivity smoke test.',
  purpose: 'configured-model-smoke',
  schema,
});
if (!image.data?.ok || !text.data?.ok)
  throw new Error(
    'Configured model smoke failed. Check current model availability, keys and quota in the provider consoles. No sensitive content was sent.',
  );
console.log(
  'One tiny synthetic image and one text gateway request passed. This does not measure label-reading accuracy.',
);
