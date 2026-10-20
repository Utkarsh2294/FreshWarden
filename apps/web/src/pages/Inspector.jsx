import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import {
  Brand,
  PageTitle,
  Panel,
  Pill,
  ErrorState,
  formatDate,
} from '../components/Ui.jsx';
export default function Inspector({ accessToken }) {
  const query = useQuery({
      queryKey: ['inspection', accessToken],
      queryFn: ({ signal }) => api(`/inspector/${accessToken}`, { signal }),
      retry: false,
    }),
    snapshot = query.data?.snapshot;
  return (
    <div className="inspector-layout">
      <header>
        <Brand />
        <span>READ-ONLY INSPECTION</span>
      </header>
      <main>
        {query.isError ? (
          <ErrorState error={query.error} />
        ) : !snapshot ? (
          <p role="status">Loading inspection evidence…</p>
        ) : (
          <>
            <PageTitle
              eyebrow="EVIDENCE SNAPSHOT"
              title={snapshot.store.name}
              description={`Access expires ${new Date(query.data.expiresAt).toLocaleString('en-IN')}`}
            />
            <p className="notice">
              {snapshot.coverageComplete
                ? 'Evidence coverage recorded.'
                : 'Evidence coverage is incomplete.'}{' '}
              This is an operational prototype, not a regulatory certificate.
            </p>
            <div className="spacer" />
            <Panel title="Daily checklist">
              <div className="checklist">
                {snapshot.checklist.map((item) => (
                  <div key={item.key}>
                    <Pill
                      status={item.status === 'complete' ? 'green' : 'amber'}
                    >
                      {item.status.replaceAll('_', ' ')}
                    </Pill>
                    <strong>{item.label}</strong>
                  </div>
                ))}
              </div>
            </Panel>
            <div className="spacer" />
            <Panel title="Current lot register">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Batch</th>
                      <th>Units</th>
                      <th>Effective expiry</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.lots.map((l) => (
                      <tr key={l._id}>
                        <td>{l.name}</td>
                        <td>{l.batchNo}</td>
                        <td>{l.qty}</td>
                        <td>{formatDate(l.effectiveExpDate)}</td>
                        <td>
                          <Pill status={l.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <div className="spacer" />
            <Panel title="Evidence timeline">
              <div className="capture-pad">
                {snapshot.evidence.length ? (
                  snapshot.evidence.map((e) => (
                    <details key={e._id}>
                      <summary>
                        {e.kind} · {new Date(e.takenAt).toLocaleString('en-IN')}
                      </summary>
                      <img
                        className="evidence-photo"
                        src={`${import.meta.env.VITE_API_URL || ''}/api/inspector/${accessToken}/evidence/${e._id}`}
                        alt={`${e.kind} evidence recorded on ${formatDate(e.takenAt)}`}
                      />
                      <small>SHA-256 {e.sha256}</small>
                    </details>
                  ))
                ) : (
                  <p>No evidence photos recorded for this period.</p>
                )}
              </div>
            </Panel>
            <div className="spacer" />
            <Panel title="Incident register">
              <div className="capture-pad">
                {snapshot.incidents.map((i) => (
                  <article className="finding" key={i._id}>
                    <strong>{i.type.replaceAll('_', ' ')}</strong>
                    <Pill status={i.status}>{i.status}</Pill>
                    <p>{i.summary}</p>
                    {i.capa?.action && (
                      <p>Corrective action: {i.capa.action}</p>
                    )}
                  </article>
                ))}
              </div>
            </Panel>
            <p className="snapshot-hash">
              Snapshot SHA-256: {snapshot.snapshotHash}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
