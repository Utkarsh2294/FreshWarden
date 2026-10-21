import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { discardScan, listScans, syncScans } from '../lib/outbox.js';
export default function SyncStatus({ userId, storeId, token }) {
  const client = useQueryClient();
  const [entries, setEntries] = useState([]),
    [online, setOnline] = useState(navigator.onLine),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      running = false;
    async function refresh() {
      if (active) setOnline(navigator.onLine);
      try {
        const rows = await listScans(userId, storeId);
        if (active) setEntries(rows);
      } catch (error) {
        if (active) setError(error.message);
      }
    }
    async function tick(force = false) {
      if (active) setOnline(navigator.onLine);
      if (running || !navigator.onLine) return refresh();
      running = true;
      try {
        const rows = await listScans(userId, storeId);
        if (!rows.length) return refresh();
        if (active) setBusy(true);
        const results = await syncScans({ userId, storeId, token, force });
        if (results.some((r) => r.result)) await client.invalidateQueries();
        await refresh();
      } catch (error) {
        if (active) setError(error.message);
      } finally {
        running = false;
        if (active) setBusy(false);
      }
    }
    const retry = () => tick(true),
      interval = setInterval(() => tick(), 5000);
    window.addEventListener('online', retry);
    window.addEventListener('offline', refresh);
    window.addEventListener('fw-outbox', refresh);
    window.addEventListener('fw-sync', retry);
    tick();
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('online', retry);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('fw-outbox', refresh);
      window.removeEventListener('fw-sync', retry);
    };
  }, [userId, storeId, token, client]);
  return (
    <section className="sync-status" aria-label="Connection and scan queue">
      <span role="status">
        {!online
          ? 'Offline / ऑफ़लाइन'
          : busy
            ? 'Syncing scans… / सिंक हो रहा है…'
            : entries.length
              ? `${entries.length} scan(s) awaiting sync`
              : 'Online · scan queue clear / ऑनलाइन'}
      </span>
      {!!entries.length && (
        <button
          className="button secondary"
          disabled={busy || !online}
          onClick={() => window.dispatchEvent(new Event('fw-sync'))}
        >
          Retry sync
        </button>
      )}
      {entries
        .filter((entry) => entry.blocked)
        .map((entry) => (
          <div key={entry.id} className="sync-error">
            <span>
              {entry.path.includes('inward') ? 'Pack' : 'Shelf'} scan:{' '}
              {entry.error} Evidence stays on this device.
            </span>
            <button
              className="button secondary"
              onClick={() =>
                discardScan(entry.id).catch((error) => setError(error.message))
              }
            >
              Remove queued copy
            </button>
          </div>
        ))}
      {error && <span role="alert">Local storage: {error}</span>}
    </section>
  );
}
