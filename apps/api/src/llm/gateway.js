import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import Bottleneck from 'bottleneck';
import { createHash } from 'node:crypto';
import { LlmCall } from '../models/index.js';
export function createGateway(
  config,
  {
    generate,
    audit = (entry) => LlmCall.create(entry),
    now = Date.now,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    observe = () => {},
    retries = 2,
  } = {},
) {
  const client = config.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: config.GEMINI_API_KEY,
        httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } },
      })
    : null;
  const limiter = new Bottleneck({
    minTime: Math.ceil(60000 / (config.LLM_MAX_RPM_GEMINI || 12)),
    maxConcurrent: 1,
    highWater: 10,
    strategy: Bottleneck.strategy.OVERFLOW,
  });
  const cache = new Map();
  const textLimiter = new Bottleneck({
    minTime: Math.ceil(60000 / (config.LLM_MAX_RPM_GROQ || 25)),
    maxConcurrent: 1,
    highWater: 10,
    strategy: Bottleneck.strategy.OVERFLOW,
  });
  let failures = 0,
    openedAt = 0,
    probing = false;
  async function image({
    buffer,
    mimeType = 'image/jpeg',
    purpose,
    prompt,
    schema,
    jsonSchema,
  }) {
    const started = now(),
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
    let attempted = false,
      ownsProbe = false;
    try {
      const hit = cache.get(key);
      if (hit && hit.expires > now()) {
        entry.ok = true;
        entry.cacheHit = true;
        return { data: hit.data, provider: 'gemini', cacheHit: true };
      }
      if ((!client || !config.GEMINI_VISION_MODEL) && !generate)
        throw new Error('PROVIDER_UNCONFIGURED');
      if (failures >= 5) {
        if (now() - openedAt < 60000 || probing)
          throw new Error('CIRCUIT_OPEN');
        probing = true;
        ownsProbe = true;
      }
      attempted = true;
      let response;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          response = await limiter.schedule(() =>
            generate
              ? generate({ buffer, prompt, jsonSchema })
              : client.models.generateContent({
                  model: config.GEMINI_VISION_MODEL,
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        {
                          inlineData: {
                            mimeType,
                            data: buffer.toString('base64'),
                          },
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
          break;
        } catch (error) {
          const status = Number(error.status || error.statusCode || error.code);
          if (attempt === retries || !(status === 429 || status >= 500))
            throw error;
          await wait(500 * 2 ** attempt + Math.floor(Math.random() * 250));
        }
      }
      const data = schema.parse(JSON.parse(response.text));
      failures = 0;
      entry.ok = true;
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + 86400000 });
      return { data, provider: 'gemini', cacheHit: false };
    } catch (error) {
      if (attempted) {
        failures++;
        if (failures >= 5) openedAt = now();
      }
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
      if (ownsProbe) probing = false;
      entry.latencyMs = now() - started;
      observe(entry);
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
          maxRetries: retries,
        });
        const response = await textLimiter.schedule(() =>
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
        const entry = {
          provider: 'groq',
          model: config.GROQ_TEXT_MODEL || 'unconfigured',
          purpose,
          latencyMs: Date.now() - started,
          ok,
          error: ok ? undefined : 'TEXT_UNAVAILABLE',
        };
        observe(entry);
        await audit(entry).catch(() => {});
      }
    },
    status: () => ({
      configured: !!(client && config.GEMINI_VISION_MODEL),
      circuit:
        failures >= 5
          ? now() - openedAt < 60000
            ? 'open'
            : 'half_open'
          : 'closed',
    }),
  };
}
