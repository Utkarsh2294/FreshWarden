import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { preparePhoto } from '../lib/capture.js';
import { usePhotoDraft } from '../hooks/usePhotoDraft.js';
import {
  PageTitle,
  Panel,
  Pill,
  Empty,
  ErrorState,
  formatDate,
} from '../components/Ui.jsx';
import EvidencePhoto from '../components/EvidencePhoto.jsx';
export default function Shelf({ data, token, user }) {
  const storeId = data.store._id,
    [zoneId, setZoneId] = useState(data.store.zones[0].zoneId),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    photo = usePhotoDraft(`shelf:${user._id}:${storeId}:${zoneId}`);
  const scans = useQuery({
    queryKey: ['shelf', storeId, zoneId],
    queryFn: ({ signal }) =>
      api(`/shelf?storeId=${storeId}&zoneId=${zoneId}`, { token, signal }),
  });
  async function submit(event) {
    event.preventDefault();
    if (!photo.file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('image', await preparePhoto(photo.file), 'shelf.jpg');
      body.append('storeId', storeId);
      body.append('zoneId', zoneId);
      setResult(await api('/shelf/scan', { token, method: 'POST', body }));
      await scans.refetch();
      await photo.clear();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  const active = result || scans.data?.scans[0];
  return (
    <>
      <PageTitle
        eyebrow="GATE 03 / LOOK CLOSER"
        title="A shelf check that closes the loop."
        description="Capture visible risks. Give each finding an owner. Close it with fresh proof."
      />
      <div className="split-grid">
        <Panel
          title="Photograph the top two rows"
          meta="Keep labels visible, floors in frame where relevant, and people out of the photo."
        >
          <form className="form-grid" onSubmit={submit}>
            <label className="full">
              Storage zone
              <select
                value={zoneId}
                onChange={(e) => {
                  setZoneId(e.target.value);
                  setResult(null);
                  photo.setFile(null);
                }}
              >
                {data.store.zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="capture-area full">
              {photo.url ? (
                <img src={photo.url} alt="Shelf selected for inspection" />
              ) : (
                <>
                  <Camera size={30} />
                  <strong>Capture a shelf photo</strong>
                  <span>No people. Clear light. Readable labels.</span>
                </>
              )}
              <input
                type="file"
                aria-label="Shelf photo"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file?.size > 8388608)
                    setError(new Error('Photo must be smaller than 8 MB.'));
                  else photo.setFile(file || null);
                }}
              />
            </label>
            <button className="button primary" disabled={!photo.file || busy}>
              <ShieldCheck size={17} />
              {busy ? 'Inspecting visible conditions…' : 'Inspect this shelf'}
            </button>
            <p className="capture-tip full">
              Saved locally until successfully submitted. A model cannot certify
              conditions outside the photo.
            </p>
          </form>
        </Panel>
        <Panel
          title="Inspection result"
          meta={
            scans.data?.schedule
              ? `Next scheduled scan: ${new Date(scans.data.schedule.dueAt).toLocaleString('en-IN')}`
              : 'Loading scan schedule'
          }
        >
          {error && <ErrorState error={error} />}{' '}
          {!active ? (
            <Empty title="No shelf evidence yet">
              Submit a photo to begin the inspection trail.
            </Empty>
          ) : (
            <div className="capture-pad">
              <Pill status={active.status === 'reviewed' ? 'green' : 'amber'}>
                {active.status.replaceAll('_', ' ')}
              </Pill>
              <h3 className="result-heading">
                {active.result.overallImpression}
              </h3>
              {active.status !== 'reviewed' && (
                <p className="notice">
                  {active.result.poorReason ||
                    'Retake in better light or ask a supervisor to inspect the shelf.'}
                </p>
              )}
              <EvidencePhoto id={active.evidenceId} token={token} />
              {active.result.findings.map((finding, index) => (
                <Finding
                  key={`${active._id}:${index}`}
                  finding={finding}
                  index={index}
                  scan={active}
                  token={token}
                  canReview={['manager', 'admin'].includes(user.role)}
                  onReview={async () => {
                    setResult(null);
                    await scans.refetch();
                  }}
                />
              ))}
              {active.status === 'reviewed' &&
                !active.result.findings.length && (
                  <p className="notice">
                    No visible findings returned. This is a visual observation,
                    not proof that all stock is safe.
                  </p>
                )}
              <small className="muted">
                Scan {active._id} · rule {active.ruleVersion}
              </small>
            </div>
          )}
        </Panel>
      </div>
      <div className="spacer" />
      <Panel
        title="Shelf evidence history"
        meta="Select a record to review its original photo and findings"
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Status</th>
                <th>Findings</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {scans.data?.scans.map((scan) => (
                <tr key={scan._id}>
                  <td>{formatDate(scan.createdAt)}</td>
                  <td>{scan.status.replaceAll('_', ' ')}</td>
                  <td>{scan.result.findings.length}</td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() => setResult(scan)}
                    >
                      Open record
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
function Finding({ finding, index, scan, token, canReview, onReview }) {
  const [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    review = scan.reviews?.find((r) => r.index === index);
  async function act(action) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/shelf/${scan._id}/findings/${index}`, {
        token,
        method: 'PATCH',
        body: { action, note },
      });
      await onReview();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="finding">
      <div>
        <Pill status={finding.severity === 3 ? 'red' : 'amber'}>
          {finding.type.replaceAll('_', ' ')}
        </Pill>
        <small>
          {Math.round(finding.confidence * 100)}% confidence · {finding.region}
        </small>
      </div>
      <p>{finding.note}</p>
      {finding.confidence < 0.6 && !review && (
        <p className="muted">
          Unverified: no task is created until a supervisor confirms.
        </p>
      )}
      {review ? (
        <p>Review saved: {review.action}</p>
      ) : (
        canReview &&
        finding.confidence < 0.6 && (
          <>
            <label>
              Review note
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                minLength={5}
                maxLength={500}
              />
            </label>
            <div className="inline-actions">
              <button
                className="button secondary"
                disabled={busy || note.length < 5}
                onClick={() => act('dismiss')}
              >
                Dismiss finding
              </button>
              <button
                className="button primary"
                disabled={busy || note.length < 5}
                onClick={() => act('confirm')}
              >
                Confirm & create task
              </button>
            </div>
          </>
        )
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </article>
  );
}
