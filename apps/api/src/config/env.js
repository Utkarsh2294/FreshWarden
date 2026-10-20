import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
export function readEnv(source = process.env) {
  const result = z.object({
    MONGO_URI: z.string().min(1), JWT_SECRET: z.string().min(32),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    GEMINI_API_KEY: z.string().default(''), GEMINI_VISION_MODEL: z.string().default(''),
    GROQ_API_KEY: z.string().default(''), GROQ_TEXT_MODEL: z.string().default(''),
    GROQ_WHISPER_MODEL: z.string().default(''), DEVICE_SHARED_SECRET: z.string().default(''),
    LLM_MAX_RPM_GEMINI: z.coerce.number().int().min(1).max(60).default(12),
    LLM_MAX_RPM_GROQ: z.coerce.number().int().min(1).max(60).default(25),
  }).safeParse(source);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return result.data;
}
