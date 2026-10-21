import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { database, saveDraft, loadDraft } from './capture.js';
import { queueScan, listScans, syncScans, cachedOverview } from './outbox.js';
const input = () => {
  const body = new FormData();
  body.append('requestId', 'stable-id');
  body.append('storeId', 's1');
  return {
    path: '/inward/verify',
    body,
    userId: 'u1',
    storeId: 's1',
    token: 'session-only',
  };
};
beforeEach(async () => {
  const db = await database();
  for (const name of ['drafts', 'outbox', 'snapshots']) await db.clear(name);
  db.close();
});
it('retains old capture drafts alongside the new queue', async () => {
  await saveDraft('existing', { barcode: '8900000000003' });
  await queueScan(input());
  expect((await loadDraft('existing')).barcode).toBe('8900000000003');
});
it('deduplicates stable requests and never stores authorization', async () => {
  await queueScan(input());
  await queueScan(input());
  const entries = await listScans('u1', 's1');
  expect(entries).toHaveLength(1);
  expect(JSON.stringify(entries)).not.toContain('session-only');
});
it('backs off network failure, scopes replay, and removes only successful scans', async () => {
  await queueScan(input());
  const fail = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  await syncScans({ ...input(), request: fail });
  expect((await listScans('u1', 's1'))[0].nextAt).toBeGreaterThan(Date.now());
  const request = vi
    .fn()
    .mockResolvedValue({ _id: 'saved', verdict: { status: 'amber' } });
  await syncScans({ ...input(), userId: 'u2', force: true, request });
  expect(request).not.toHaveBeenCalled();
  await syncScans({ ...input(), request });
  expect(request).not.toHaveBeenCalled();
  await syncScans({ ...input(), force: true, request });
  expect(request.mock.calls[0][1].body.get('requestId')).toBe('stable-id');
  expect(await listScans('u1', 's1')).toHaveLength(0);
});
it('retains rejected evidence, stops automatic retries, and prohibits queued packing', async () => {
  await queueScan(input());
  const request = vi
    .fn()
    .mockRejectedValue(
      Object.assign(new Error('Sign in again'), { status: 401 }),
    );
  await syncScans({ ...input(), request });
  expect((await listScans('u1', 's1'))[0].blocked).toBe(true);
  await syncScans({ ...input(), request });
  expect(request).toHaveBeenCalledTimes(1);
  await expect(
    queueScan({ ...input(), path: '/dispatch/pack' }),
  ).rejects.toThrow('Only evidence');
});
it('serves a labelled snapshot on network failure, never on revoked access', async () => {
  await cachedOverview('u1:s1', async () => ({ lots: [] }));
  const cached = await cachedOverview('u1:s1', async () => {
    throw new TypeError('Offline');
  });
  expect(cached.offlineSnapshotAt).toBeTruthy();
  await expect(
    cachedOverview('u1:s1', async () => {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }),
  ).rejects.toThrow('Forbidden');
  await expect(
    cachedOverview('u2:s1', async () => {
      throw new TypeError('Offline');
    }),
  ).rejects.toThrow('Offline');
});
