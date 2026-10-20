import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import Bottleneck from 'bottleneck';
import { createHash } from 'node:crypto';
import { LlmCall } from '../models/index.js';
export function createGateway(
  config,
  { generate, audit = (entry) => LlmCall.create(entry) } = {},
) {
  const client = config.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: config.GEMINI_API_KEY,
        httpOptions: { timeout: 15000 },
      })
    : null;
  const limiter = new Bottleneck({
    minTime: Math.ceil(60000 / (config.LLM_MAX_RPM_GEMINI || 12)),
    maxConcurrent: 1,
    highWater: 10,
    strategy: Bottleneck.strategy.OVERFLOW,
  });
  const cache = new Map();
  let failures = 0,
    openedAt = 0;
  async function image({
    buffer,
    mimeType = 'image/jpeg',
    purpose,
    prompt,
    schema,
    jsonSchema,
  }) {
    const started = Date.now(),
      key = createHash('sha256')
        .update(buffer)
        .update(purpose)
        .update(prompt)
        .update(config.GEMINI_VISION_MODEL || '')
        .digest('hex');
    const entry = {
      provider: 'gemini',
      model: config.GEMINI_VISION_MODEL || 'unconfigured',
      purpose,
      cacheHit: false,
      ok: false,
      latencyMs: 0,
    };
    try {
      const hit = cache.get(key);
      if (hit && hit.expires > Date.now()) {
        entry.ok = true;
        entry.cacheHit = true;
        return { data: hit.data, provider: 'gemini', cacheHit: true };
      }
      if ((!client || !config.GEMINI_VISION_MODEL) && !generate)
        throw new Error('PROVIDER_UNCONFIGURED');
      if (failures >= 5 && Date.now() - openedAt < 60000)
        throw new Error('CIRCUIT_OPEN');
      const response = await limiter.schedule(() =>
        generate
          ? generate({ buffer, prompt, jsonSchema })
          : client.models.generateContent({
              model: config.GEMINI_VISION_MODEL,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: { mimeType, data: buffer.toString('base64') },
                    },
                    { text: prompt },
                  ],
                },
              ],
              config: {
                responseMimeType: 'application/json',
                responseJsonSchema: jsonSchema,
                temperature: 0,
              },
            }),
      );
      const data = schema.parse(JSON.parse(response.text));
      failures = 0;
      entry.ok = true;
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: Date.now() + 86400000 });
      return { data, provider: 'gemini', cacheHit: false };
    } catch (error) {
      failures++;
      if (failures === 5) openedAt = Date.now();
      entry.error = ['PROVIDER_UNCONFIGURED', 'CIRCUIT_OPEN'].includes(
        error.message,
      )
        ? error.message
        : 'PROVIDER_FAILED';
      return {
        data: null,
        needsHuman: true,
        provider: 'none',
        error: entry.error,
      };
    } finally {
      entry.latencyMs = Date.now() - started;
      await audit(entry).catch(() => {});
    }
  }
  return {
    image,
    text: async ({ system, user, purpose, schema }) => {
      const started = Date.now();
      let ok = false;
      try {
        if (!config.GROQ_API_KEY || !config.GROQ_TEXT_MODEL)
          return { data: null, provider: 'none' };
        const client = new Groq({
          apiKey: config.GROQ_API_KEY,
          timeout: 15000,
          maxRetries: 2,
        });
        const response = await limiter.schedule(() =>
          client.chat.completions.create({
            model: config.GROQ_TEXT_MODEL,
            temperature: 0,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
          }),
        );
        const data = schema.parse(
          JSON.parse(response.choices[0]?.message?.content || ''),
        );
        ok = true;
        return { data, provider: 'groq' };
      } catch {
        return { data: null, provider: 'none' };
      } finally {
        await audit({
          provider: 'groq',
          model: config.GROQ_TEXT_MODEL || 'unconfigured',
          purpose,
          latencyMs: Date.now() - started,
          ok,
          error: ok ? undefined : 'TEXT_UNAVAILABLE',
        }).catch(() => {});
      }
    },
    status: () => ({
      configured: !!(client && config.GEMINI_VISION_MODEL),
      circuit:
        failures >= 5 && Date.now() - openedAt < 60000 ? 'open' : 'closed',
    }),
  };
}
