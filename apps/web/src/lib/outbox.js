import { database } from './capture.js';
import { api } from './api.js';
const inFlight = new Map();
const changed = () => window.dispatchEvent(new Event('fw-outbox'));
async function write(entry) {
  const db = await database();
  try {
    await db.put('outbox', entry, entry.id);
  } finally {
    db.close();
  }
  changed();
}
export async function listScans(userId, storeId) {
  const db = await database();
  try {
    return (await db.getAll('outbox'))
      .filter((entry) => entry.userId === userId && entry.storeId === storeId)
      .sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}
export async function discardScan(id) {
  const db = await database();
  try {
    await db.delete('outbox', id);
  } finally {
    db.close();
  }
  changed();
}
export async function queueScan({ path, body, userId, storeId }) {
  if (!['/inward/verify', '/shelf/scan'].includes(path))
    throw new Error('Only evidence scans can be queued.');
  const id = `${userId}:${storeId}:${path}:${body.get('requestId') || crypto.randomUUID()}`;
  const entries = await listScans(userId, storeId);
  if (entries.some((entry) => entry.id === id)) return id;
  if (entries.length >= 50)
    throw new Error('Queue full. Sync or remove an existing scan first.');
  // Store bytes rather than File objects: portable across browser structured-clone implementations.
  const fields = await Promise.all(
    [...body.entries()].map(async ([key, value]) => [
      key,
      typeof value === 'string'
        ? value
        : {
            bytes: await value.arrayBuffer(),
            type: value.type,
            name: value.name,
          },
    ]),
  );
  await write({
    id,
    path,
    userId,
    storeId,
    fields,
    attempts: 0,
    nextAt: 0,
    createdAt: Date.now(),
  });
  return id;
}
async function send(entry, token, request) {
  const body = new FormData();
  for (const [key, value] of entry.fields)
    if (typeof value === 'string') body.append(key, value);
    else
      body.append(
        key,
        new Blob([value.bytes], { type: value.type }),
        value.name,
      );
  try {
    const result = await request(entry.path, { token, method: 'POST', body });
    await discardScan(entry.id);
    return { result };
  } catch (error) {
    const terminal =
      error.status >= 400 && error.status < 500 && error.status !== 429;
    await write({
      ...entry,
      attempts: entry.attempts + 1,
      nextAt:
        Date.now() + Math.min(300000, 2000 * 2 ** Math.min(entry.attempts, 8)),
      error: terminal ? error.message : '',
      blocked: terminal,
    });
    return { queued: true, error: terminal ? error : null };
  }
}
export async function syncScans({
  userId,
  storeId,
  token,
  force = false,
  request = api,
  onlyId,
}) {
  const results = [];
  for (const entry of await listScans(userId, storeId)) {
    if (onlyId && entry.id !== onlyId) continue;
    if (!force && (entry.blocked || entry.nextAt > Date.now())) continue;
    if (!inFlight.has(entry.id)) {
      const pending = send(entry, token, request).finally(() =>
        inFlight.delete(entry.id),
      );
      inFlight.set(entry.id, pending);
    }
    results.push(await inFlight.get(entry.id));
    if (results.at(-1)?.error?.status === 401) break;
  }
  return results;
}
export async function submitScan(input) {
  const id = await queueScan(input);
  const [outcome] = await syncScans({ ...input, onlyId: id, force: true });
  if (outcome.error) throw outcome.error;
  return outcome;
}
export async function cachedOverview(key, fetcher) {
  const db = await database().catch(() => null);
  if (!db) return fetcher();
  try {
    try {
      const data = await fetcher();
      await db.put(
        'snapshots',
        { data, savedAt: new Date().toISOString() },
        key,
      );
      return data;
    } catch (error) {
      if (error.status || error.name === 'AbortError') throw error;
      const saved = await db.get('snapshots', key);
      if (!saved) throw error;
      return { ...saved.data, offlineSnapshotAt: saved.savedAt };
    }
  } finally {
    db.close();
  }
}
