import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { preparePhoto } from '../lib/capture.js';
import { usePhotoDraft } from '../hooks/usePhotoDraft.js';
import {
  PageTitle,
  Panel,
  Pill,
  Empty,
  ErrorState,
} from '../components/Ui.jsx';
import EvidencePhoto from '../components/EvidencePhoto.jsx';
export default function Incidents({ data, token, user }) {
  const storeId = data.store._id,
    client = useQueryClient(),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(null),
    [action, setAction] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    photo = usePhotoDraft(
      `capa:${user._id}:${storeId}:${selected?._id || 'none'}`,
    ),
    manager = ['manager', 'admin'].includes(user.role);
  const incidents = useQuery({
    queryKey: ['incidents', storeId, page],
    queryFn: ({ signal }) =>
      api(`/incidents?storeId=${storeId}&page=${page}`, { token, signal }),
    refetchInterval: 30000,
  });
  async function close(event) {
    event.preventDefault();
    if (busy || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('action', action);
      body.append('image', await preparePhoto(photo.file), 'proof.jpg');
      await api(`/incidents/${selected._id}/capa`, {
        token,
        method: 'PATCH',
        body,
      });
      await photo.clear();
      setSelected(null);
      setAction('');
      await incidents.refetch();
      await client.invalidateQueries({ queryKey: ['overview', storeId] });
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function dismiss() {
    if (busy || !selected) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/incidents/${selected._id}/dismiss`, {
        token,
        method: 'PATCH',
        body: { reason: action },
      });
      setSelected(null);
      setAction('');
      await incidents.refetch();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="OVERSIGHT / CORRECTIVE ACTION"
        title="A finding is only the beginning."
        description="Assign ownership, track deadlines, and close the loop with verified photo evidence."
      />
      {incidents.isError && (
        <ErrorState error={incidents.error} retry={() => incidents.refetch()} />
      )}
      <Panel
        title="Incident inbox"
        meta={`${incidents.data?.total || 0} records · page ${page}`}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Finding / zone</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {incidents.data?.items.map((item) => (
                <tr key={item._id}>
                  <td>
                    <strong>{item.type.replaceAll('_', ' ')}</strong>
                    <small>{item.summary}</small>
                    <small>{item.zoneId}</small>
                  </td>
                  <td>{item.owner?.name || 'Unassigned'}</td>
                  <td>{new Date(item.dueAt).toLocaleString('en-IN')}</td>
                  <td>
                    <Pill status={item.severity === 3 ? 'red' : 'amber'}>
                      Level {item.severity}
                    </Pill>
                  </td>
                  <td>{item.status.replaceAll('_', ' ')}</td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setSelected(item);
                        setAction('');
                        setError(null);
                        photo.setFile(null);
                      }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {incidents.data && !incidents.data.items.length && (
          <Empty title="No incidents recorded">
            Complete the scheduled checks to establish coverage.
          </Empty>
        )}
        <div className="inline-actions panel-foot">
          <button
            className="button secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            className="button secondary"
            disabled={!incidents.data || page * 30 >= incidents.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </Panel>
      {selected && (
        <>
          <div className="spacer" />
          <Panel
            title={selected.type.replaceAll('_', ' ')}
            meta={`Record ${selected._id}`}
          >
            <div className="capture-pad">
              <p>{selected.summary}</p>
              {selected.evidenceId && (
                <EvidencePhoto id={selected.evidenceId} token={token} />
              )}
              <p className="notice">
                Closing requires a new proof photo and a successful
                re-inspection. Sensor incidents also require recovered
                telemetry.
              </p>
              {error && <ErrorState error={error} />}{' '}
              {selected.status === 'closed' ? (
                <p className="notice">Closed: {selected.capa?.action}</p>
              ) : manager ? (
                <form className="form-grid" onSubmit={close}>
                  <label className="full">
                    Corrective action or false-alarm reason
                    <textarea
                      required
                      minLength={10}
                      maxLength={1000}
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                      placeholder="Describe the action taken and the evidence…"
                    />
                  </label>
                  <label className="full">
                    New proof photo
                    <input
                      type="file"
                      aria-label="Corrective action proof photo"
                      required
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={(e) =>
                        photo.setFile(e.target.files?.[0] || null)
                      }
                    />
                  </label>
                  {photo.url && (
                    <img
                      className="evidence-photo full"
                      src={photo.url}
                      alt="New corrective action proof"
                    />
                  )}
                  <div className="inline-actions full">
                    <button
                      className="button primary"
                      disabled={busy || !photo.file}
                    >
                      {busy ? 'Verifying proof…' : 'Verify proof & close'}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        busy ||
                        action.length < 10 ||
                        ['SENSOR_SILENT', 'TEMPERATURE_EXCURSION'].includes(
                          selected.type,
                        )
                      }
                      onClick={dismiss}
                    >
                      Dismiss as false alarm
                    </button>
                  </div>
                </form>
              ) : (
                <p className="notice">
                  A supervisor must review and close this incident.
                </p>
              )}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
