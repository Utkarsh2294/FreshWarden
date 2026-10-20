import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readEnv } from '../src/config/env.js';
const app = createApp({ CLIENT_ORIGIN: 'http://localhost:5173' });
describe('foundation boundaries', () => {
  it('reports unavailable Mongo honestly', async () => { const res = await request(app).get('/health'); expect(res.status).toBe(503); expect(res.body.mongo).toBe('down'); });
  it('validates required configuration', () => expect(() => readEnv({})).toThrow('Invalid environment'));
  it('handles CORS preflight', async () => { const res = await request(app).options('/api/me').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET'); expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173'); });
  it('rejects invalid JSON', async () => { const res = await request(app).post('/api/nope').set('Content-Type', 'application/json').send('{'); expect(res.status).toBe(400); });
});
