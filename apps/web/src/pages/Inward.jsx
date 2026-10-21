import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { submitScan } from '../lib/outbox.js';
import {
  preparePhoto,
  readPack,
  saveDraft,
  loadDraft,
  clearDraft,
} from '../lib/capture.js';
import { parseLabelDate } from '../../../api/src/rules/parseLabelDate.js';
import {
  PageTitle,
  Panel,
  Pill,
  ErrorState,
  formatDate,
} from '../components/Ui.jsx';
import EvidencePhoto from '../components/EvidencePhoto.jsx';
import { reasonText } from '../lib/reasons.js';
const emptyFields = {
  mfgDate: '',
  expDate: '',
  batchNo: '',
  fssaiNo: '',
  mrp: '',
};
export default function Inward({ data, token, user }) {
  const { i18n } = useTranslation(),
    hi = i18n.language === 'hi',
    client = useQueryClient(),
    storeId = data.store._id,
    key = `${user._id}:${storeId}`;
  const [file, setFile] = useState(null),
    [url, setUrl] = useState(''),
    [fields, setFields] = useState(emptyFields),
    [barcode, setBarcode] = useState(''),
    [zoneId, setZoneId] = useState(data.store.zones[0].zoneId),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(null),
    [result, setResult] = useState(null),
    [source, setSource] = useState('manual'),
    [confidence, setConfidence] = useState(0),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [crop, setCrop] = useState({ x: 0, y: 30, w: 100, h: 40 }),
    [ocrText, setOcrText] = useState(''),
    [queued, setQueued] = useState(false);
  const scans = useQuery({
    queryKey: ['inward', storeId],
    queryFn: ({ signal }) =>
      api(`/inward?storeId=${storeId}`, { token, signal }),
  });
  useEffect(() => {
    let active = true;
    loadDraft(key)
      .then((d) => {
        if (active && d) {
          setFile(d.file);
          setBarcode(d.barcode || '');
          setFields(d.fields || emptyFields);
          setRequestId(d.requestId || crypto.randomUUID());
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  useEffect(() => {
    if (file)
      saveDraft(key, { file, fields, barcode, requestId }).catch(() => {});
  }, [file, fields, barcode, requestId, key]);
  function edit(name, value) {
    setFields((previous) => ({ ...previous, [name]: value }));
    setSource('manual');
  }
  async function capture(event) {
    const next = event.target.files?.[0];
    if (!next) return;
    if (next.size > 8 * 1024 * 1024) {
      setError(new Error('Choose a photo smaller than 8 MB.'));
      return;
    }
    setFile(next);
    setResult(null);
    setSource('manual');
    setRequestId(crypto.randomUUID());
    setError(null);
  }
  async function read() {
    if (!file || busy) return;
    setBusy('Preparing photo…');
    setError(null);
    try {
      const read = await readPack(file, crop, setBusy);
      if (read.barcode) setBarcode(read.barcode);
      setOcrText(read.text);
      const lines = read.text.split('\n'),
        mfg = lines.find((l) => /MFG|MANUFACTURED|PKD/i.test(l)),
        exp = lines.find((l) => /EXP|BEST BEFORE|BB/i.test(l));
      setFields((previous) => ({
        ...previous,
        mfgDate: parseLabelDate(mfg).iso || '',
        expDate:
          parseLabelDate(exp, { mfgDate: parseLabelDate(mfg).iso }).iso || '',
        fssaiNo: read.text.match(/\b\d{14}\b/)?.[0] || previous.fssaiNo,
        mrp:
          read.text.match(/MRP[^\d]*(\d+(?:\.\d{1,2})?)/i)?.[1] || previous.mrp,
      }));
      setConfidence(read.confidence);
      setSource('ocr');
    } catch (error) {
      setError(
        new Error(
          `Photo reading unavailable: ${error.message}. Enter the printed fields for supervisor review.`,
        ),
      );
    } finally {
      setBusy('');
    }
  }
  async function verify(event) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(hi ? 'सुरक्षा नियम जाँचे जा रहे हैं…' : 'Checking safety rules…');
    setError(null);
    try {
      const body = new FormData();
      body.append('image', await preparePhoto(file), 'pack.jpg');
      for (const [name, value] of Object.entries({
        storeId,
        zoneId,
        barcode,
        requestId,
        source,
        fields: JSON.stringify({
          ...fields,
          mrp: fields.mrp === '' ? null : Number(fields.mrp),
          confidence,
        }),
      }))
        body.append(name, value);
      const outcome = await submitScan({
        path: '/inward/verify',
        token,
        body,
        userId: user._id,
        storeId,
      });
      setQueued(!!outcome.queued);
      setResult(outcome.result || null);
      await client.invalidateQueries({ queryKey: ['inward', storeId] });
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }
  async function confirm(action) {
    if (!result || busy) return;
    setBusy('Saving disposition…');
    setError(null);
    try {
      const corrected = ['manager', 'admin'].includes(user.role)
        ? {
            ...fields,
            mrp: fields.mrp === '' ? null : Number(fields.mrp),
            confidence: 1,
          }
        : undefined;
      const record = await api(`/inward/${result._id}/confirm`, {
        token,
        method: 'POST',
        body: { action, ...(corrected && { fields: corrected }) },
      });
      setResult(record);
      await clearDraft(key);
      await client.invalidateQueries({ queryKey: ['overview', storeId] });
      await client.invalidateQueries({ queryKey: ['inward', storeId] });
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="GATE 01 / DOCK TO SHELF"
        title={hi ? 'हर पैक की जाँच।' : 'Nothing unsafe gets a green light.'}
        description="Capture the label, verify the dates, and leave a traceable decision."
      />
      <div className="split-grid">
        <Panel
          title={hi ? 'लेबल कैप्चर करें' : '01 · Capture the product label'}
          meta="Product photos only. Keep people and private information out of frame."
        >
          <div className="capture-pad">
            <label className="capture-area">
              {url ? (
                <img src={url} alt="Captured product label" />
              ) : (
                <>
                  <Camera size={34} />
                  <strong>Photograph the front and printed dates</strong>
                  <span>
                    Tap to capture or choose a photo · JPEG, PNG, WebP · 8 MB
                    max
                  </span>
                </>
              )}
              <input
                aria-label="Product photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={capture}
              />
            </label>
            {file && (
              <>
                <div className="crop-preview" aria-label="Date crop preview">
                  <img src={url} alt="Date region selection" />
                  <span
                    style={{
                      left: `${crop.x}%`,
                      top: `${crop.y}%`,
                      width: `${crop.w}%`,
                      height: `${crop.h}%`,
                    }}
                  />
                </div>
                <div className="crop-controls">
                  {[
                    ['x', 'Left', 100 - crop.w],
                    ['y', 'Top', 100 - crop.h],
                    ['w', 'Width', 100 - crop.x],
                    ['h', 'Height', 100 - crop.y],
                  ].map(([name, label, max]) => (
                    <label key={name}>
                      {label} {crop[name]}%
                      <input
                        type="range"
                        min={name === 'w' || name === 'h' ? 10 : 0}
                        max={max}
                        value={crop[name]}
                        onChange={(e) =>
                          setCrop((p) => ({ ...p, [name]: +e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  className="button secondary"
                  onClick={read}
                  disabled={!!busy}
                >
                  <ScanLine size={17} />
                  {hi ? 'बारकोड और तारीख पढ़ें' : 'Read barcode & framed date'}
                </button>
              </>
            )}
            <p className="capture-tip">
              Hold steady. Avoid glare. Move the crop to the printed date. First
              OCR use needs an internet connection to download its language
              data.
            </p>
            {ocrText && (
              <details>
                <summary>Review raw OCR text</summary>
                <pre>{ocrText}</pre>
              </details>
            )}
          </div>
        </Panel>
        <Panel
          title={hi ? 'प्रिंट किए गए विवरण' : '02 · Check the printed fields'}
          meta={
            source === 'ocr'
              ? `OCR confidence ${Math.round(confidence * 100)}% · review carefully`
              : 'Manual entry always requires supervisor review'
          }
        >
          <form className="form-grid" onSubmit={verify}>
            <label className="full">
              Barcode
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{8,14}"
                value={barcode}
                onChange={(e) => {
                  setBarcode(e.target.value);
                  setResult(null);
                  setRequestId(crypto.randomUUID());
                }}
                placeholder="Scan or enter barcode"
              />
            </label>
            <label className="full">
              Storage zone
              <select
                value={zoneId}
                onChange={(e) => {
                  setZoneId(e.target.value);
                  setResult(null);
                  setRequestId(crypto.randomUUID());
                }}
              >
                {data.store.zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>
                    {z.name} · {z.type}
                  </option>
                ))}
              </select>
            </label>
            {[
              ['mfgDate', 'Manufacture date', 'date'],
              ['expDate', 'Expiry date', 'date'],
              ['batchNo', 'Batch number', 'text'],
              ['fssaiNo', 'FSSAI licence number', 'text'],
              ['mrp', 'MRP (₹)', 'number'],
            ].map(([name, label, type]) => (
              <label key={name}>
                {label}
                <input
                  type={type}
                  value={fields[name] || ''}
                  maxLength={name === 'fssaiNo' ? 14 : 80}
                  min={type === 'number' ? 0 : undefined}
                  step={type === 'number' ? '0.01' : undefined}
                  onChange={(e) => {
                    edit(name, e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
              </label>
            ))}
            <p className="notice full">
              Leave unreadable values blank. A barcode alone never proves an
              expiry date.
            </p>
            <button className="button primary full" disabled={!file || !!busy}>
              {busy || (hi ? 'पैक सत्यापित करें' : 'Verify this pack')}
              <ArrowRight size={17} />
            </button>
          </form>
        </Panel>
      </div>
      {error && <ErrorState error={error} />}{' '}
      {result && (
        <section
          className={`verdict-panel ${result.verdict.status}`}
          aria-live="polite"
        >
          <div className="verdict-title">
            {result.verdict.status === 'green' ? (
              <ShieldCheck />
            ) : result.verdict.status === 'red' ? (
              <XCircle />
            ) : (
              <TriangleAlert />
            )}
            <div>
              <span className="eyebrow">
                {result.ruleVersion} · {result.verdict.source}
              </span>
              <h2>
                {result.verdict.status === 'green'
                  ? 'Verified — ready for confirmation'
                  : result.verdict.status === 'red'
                    ? 'Stop. This pack cannot move forward.'
                    : 'Pause. A supervisor needs to review.'}
              </h2>
            </div>
            <Pill status={result.verdict.status} />
          </div>
          <EvidencePhoto id={result.evidenceId} token={token} />
          <div className="verdict-details">
            <p>
              {result.verdict.remainingDays == null
                ? 'Expiry not readable'
                : `${result.verdict.remainingDays.toFixed(1)} days remaining`}{' '}
              ·{' '}
              {result.verdict.remainingPct == null
                ? 'Shelf-life percentage unknown'
                : `${Math.round(result.verdict.remainingPct)}% shelf life remaining`}
            </p>
            <ul>
              {result.verdict.reasons.map((code) => (
                <li key={code}>{reasonText(code, i18n.language)}</li>
              ))}
            </ul>
            <small>
              Evidence {result.evidenceId} · scan {result._id}
            </small>
          </div>
          {result.status === 'pending' ? (
            <div className="verdict-actions">
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() => confirm('reject')}
              >
                Reject
              </button>
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() => confirm('quarantine')}
              >
                Quarantine
              </button>
              <button
                className="button primary"
                disabled={
                  !!busy ||
                  result.verdict.status === 'red' ||
                  (result.verdict.status === 'amber' &&
                    !['manager', 'admin'].includes(user.role))
                }
                onClick={() => confirm('accept')}
              >
                {result.verdict.status === 'amber'
                  ? 'Supervisor: accept reviewed label'
                  : 'Accept & place in zone'}
              </button>
            </div>
          ) : (
            <p className="notice">
              Disposition saved: {result.status}.{' '}
              {result.lotId && `Lot ${result.lotId}`}
            </p>
          )}
        </section>
      )}
      {queued && (
        <p className="notice" role="status">
          Photo queued on this device. Keep this app open after reconnecting.
          Review the synced scan in recent checks; no lot is accepted offline.
        </p>
      )}
      <div className="spacer" />
      <Panel
        title="Recent inward checks"
        meta="The latest 100 records in this store"
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scan / batch</th>
                <th>Recorded</th>
                <th>Verdict</th>
                <th>Disposition</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {scans.data?.map((scan) => (
                <tr key={scan._id}>
                  <td>
                    <strong>
                      {scan.extracted.batchNo || scan._id.slice(-8)}
                    </strong>
                    <small>{scan.ruleVersion}</small>
                  </td>
                  <td>{formatDate(scan.createdAt)}</td>
                  <td>
                    <Pill status={scan.verdict.status} />
                  </td>
                  <td>{scan.status}</td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setResult(scan);
                        setFields(
                          Object.fromEntries(
                            Object.keys(emptyFields).map((k) => [
                              k,
                              scan.extracted[k] ?? emptyFields[k],
                            ]),
                          ),
                        );
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
      </Panel>
    </>
  );
}
