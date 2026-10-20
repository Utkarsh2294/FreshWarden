import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import {
  PageTitle,
  Panel,
  Pill,
  ErrorState,
  formatDate,
} from '../components/Ui.jsx';
export default function Reports({ data, token, user }) {
  const storeId = data.store._id,
    [busy, setBusy] = useState(''),
    [error, setError] = useState(null),
    [created, setCreated] = useState(null),
    canShare = ['manager', 'admin'].includes(user.role);
  const snapshot = useQuery({
      queryKey: ['report', storeId],
      queryFn: ({ signal }) =>
        api(`/stores/${storeId}/health`, { token, signal }),
    }),
    links = useQuery({
      queryKey: ['inspector-links', storeId],
      queryFn: ({ signal }) =>
        api(`/inspector/links?storeId=${storeId}`, { token, signal }),
      enabled: canShare,
    });
  async function pdf() {
    setBusy('pdf');
    setError(null);
    try {
      const blob = await api(`/reports/daily?storeId=${storeId}`, { token }),
        url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `freshwarden-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }
  async function share() {
    setBusy('share');
    setError(null);
    try {
      setCreated(
        await api('/inspector/links', {
          token,
          method: 'POST',
          body: { storeId, hours: 24 },
        }),
      );
      await links.refetch();
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }
  async function revoke(id) {
    setBusy(id);
    setError(null);
    try {
      await api(`/inspector/links/${id}`, { token, method: 'DELETE' });
      if (created?.id === id) setCreated(null);
      await links.refetch();
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="COMPLIANCE / EVIDENCE OVER ASSUMPTIONS"
        title="Ready when someone asks."
        description="A traceable snapshot of what was checked, what changed, and what still needs attention."
      >
        <button
          className="button secondary"
          disabled={!!busy || !canShare}
          onClick={share}
        >
          <Link2 size={16} />
          Create inspector link
        </button>
        <button className="button primary" disabled={!!busy} onClick={pdf}>
          <Download size={16} />
          {busy === 'pdf' ? 'Building audit…' : 'Download daily audit'}
        </button>
      </PageTitle>
      {error && <ErrorState error={error} />}{' '}
      {snapshot.isError ? (
        <ErrorState error={snapshot.error} retry={() => snapshot.refetch()} />
      ) : snapshot.data ? (
        <>
          <div className="brief-banner">
            <AlertCircle size={25} />
            <div>
              <strong>
                {snapshot.data.coverageComplete
                  ? 'Evidence coverage established for this period.'
                  : 'Some evidence is still missing.'}
              </strong>
              <p>
                Store health:{' '}
                {snapshot.data.health.score === null
                  ? 'not available until coverage is complete'
                  : `${snapshot.data.health.score}/100 (rule estimate)`}
                . Limits remain unverified prototype parameters.
              </p>
            </div>
            <Pill status={snapshot.data.coverageComplete ? 'green' : 'amber'}>
              {snapshot.data.coverageComplete ? 'Recorded' : 'Needs evidence'}
            </Pill>
          </div>
          <div className="overview-grid">
            <Panel
              title="Evidence-backed checklist"
              meta={`Report date ${snapshot.data.date}`}
            >
              <div className="checklist">
                {snapshot.data.checklist.map((item) => (
                  <div key={item.key}>
                    {item.status === 'complete' ? (
                      <CheckCircle2 size={20} />
                    ) : (
                      <AlertCircle size={20} />
                    )}
                    <div>
                      <strong>{item.label}</strong>
                      <Pill
                        status={item.status === 'complete' ? 'green' : 'amber'}
                      >
                        {item.status.replaceAll('_', ' ')}
                      </Pill>
                      <details>
                        <summary>{item.refs.length} source records</summary>
                        <p>{item.refs.join(', ') || 'Not available'}</p>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel
              title="Top risks, with reasons"
              meta="Transparent rule estimate, not a laboratory measurement"
            >
              <div className="capture-pad">
                {snapshot.data.risk.slice(0, 5).map((r) => (
                  <article className="risk-row" key={r.lotId}>
                    <div>
                      <strong>{r.name}</strong>
                      <span>
                        {r.score}
                        <small>/100</small>
                      </span>
                    </div>
                    <small>
                      {r.batchNo} · {r.status}
                    </small>
                    <p>
                      {r.factors
                        .map((f) => `${f.label} +${f.value}`)
                        .join(' · ') ||
                        'No positive factors in this rule estimate.'}
                    </p>
                  </article>
                ))}
              </div>
            </Panel>
          </div>
          <Panel
            title="Rule and evidence trace"
            meta="Current register at generation time; daily activities use the reporting period"
          >
            <div className="capture-pad">
              <p className="notice">{snapshot.data.inventoryScope}</p>
              <details>
                <summary>View versions and snapshot hash</summary>
                <pre>
                  {snapshot.data.rules
                    .map((r) => `${r.key}: ${r.version}`)
                    .join('\n')}
                  {'\n\n'}SHA-256 {snapshot.data.snapshotHash}
                </pre>
              </details>
            </div>
          </Panel>
        </>
      ) : (
        <p role="status">Building evidence snapshot…</p>
      )}
      <div className="spacer" />
      {canShare && (
        <Panel
          title="Read-only inspector access"
          meta="Expires after 24 hours. Revocation takes effect on the next request."
        >
          {created && (
            <div className="capture-pad">
              <label>
                New inspection link
                <input readOnly value={created.url} />
              </label>
              <a
                className="button secondary"
                href={created.url}
                target="_blank"
                rel="noreferrer"
              >
                Open read-only inspection
              </a>
              <small className="muted">
                Expires {new Date(created.expiresAt).toLocaleString('en-IN')}
              </small>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Accesses</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {links.data?.map((link) => (
                  <tr key={link._id}>
                    <td>{formatDate(link.createdAt)}</td>
                    <td>{new Date(link.expiresAt).toLocaleString('en-IN')}</td>
                    <td>{link.accessCount}</td>
                    <td>
                      {link.revokedAt
                        ? 'Revoked'
                        : new Date(link.expiresAt) < new Date()
                          ? 'Expired'
                          : 'Active'}
                    </td>
                    <td>
                      <button
                        className="button secondary"
                        disabled={!!busy || !!link.revokedAt}
                        onClick={() => revoke(link._id)}
                      >
                        Revoke access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
