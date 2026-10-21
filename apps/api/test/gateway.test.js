import { it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { createGateway } from '../src/llm/gateway.js';
const args = {
  buffer: Buffer.from('test'),
  purpose: 'test',
  prompt: 'test',
  schema: z.object({ ok: z.boolean() }),
  jsonSchema: {},
};
const config = { LLM_MAX_RPM_GEMINI: 60000 };
it('opens after five failed requests, admits one half-open probe, and recovers', async () => {
  let time = 100000,
    release;
  const generate = jest.fn().mockRejectedValue(new Error('bad key'));
  const g = createGateway(config, {
    generate,
    now: () => time,
    audit: async () => {},
  });
  for (let i = 0; i < 5; i++) await g.image(args);
  expect(g.status().circuit).toBe('open');
  expect((await g.image(args)).error).toBe('CIRCUIT_OPEN');
  expect(generate).toHaveBeenCalledTimes(5);
  time += 60001;
  generate.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const probe = g.image(args);
  while (!release) await new Promise((resolve) => setTimeout(resolve, 2));
  expect(g.status().circuit).toBe('half_open');
  expect((await g.image(args)).error).toBe('CIRCUIT_OPEN');
  release({ text: '{"ok":true}' });
  expect((await probe).data.ok).toBe(true);
  expect(g.status().circuit).toBe('closed');
});
it('failed half-open probe reopens for another full cooldown', async () => {
  let time = 100000;
  const g = createGateway(config, {
    generate: async () => {
      throw new Error('failure');
    },
    now: () => time,
    audit: async () => {},
  });
  for (let i = 0; i < 5; i++) await g.image(args);
  time += 60001;
  await g.image(args);
  expect(g.status().circuit).toBe('open');
  time += 59999;
  expect((await g.image(args)).error).toBe('CIRCUIT_OPEN');
});
it('retries only transient errors twice with backoff, then returns human review', async () => {
  const generate = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('busy'), { status: 429 })),
    wait = jest.fn(async () => {});
  const g = createGateway(config, { generate, wait, audit: async () => {} });
  expect((await g.image(args)).needsHuman).toBe(true);
  expect(generate).toHaveBeenCalledTimes(3);
  expect(wait.mock.calls[0][0]).toBeGreaterThanOrEqual(500);
  expect(wait.mock.calls[1][0]).toBeGreaterThanOrEqual(1000);
});
