import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PackageCheck, ScanLine, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { saveDraft } from '../lib/capture.js';
import {
  PageTitle,
  Panel,
  Pill,
  ErrorState,
  formatDate,
} from '../components/Ui.jsx';
export default function Dispatch({ data, token, user }) {
  const storeId = data.store._id,
    client = useQueryClient(),
    { i18n } = useTranslation(),
    [orderId, setOrderId] = useState(
      () => `ORDER-${Date.now().toString().slice(-6)}`,
    ),
    [barcode, setBarcode] = useState(''),
    [selected, setSelected] = useState(data.lots[0]?._id || ''),
    [qty, setQty] = useState(1),
    [items, setItems] = useState([]),
    [eta, setEta] = useState(15),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [packed, setPacked] = useState(null),
    [foodBag, setFoodBag] = useState(''),
    [nonFoodBag, setNonFoodBag] = useState(''),
    [reason, setReason] = useState(''),
    [offline, setOffline] = useState(false);
  const name = (id) =>
    data.lots.find((l) => l._id === String(id))?.productId?.name ||
    'Unknown lot';
  function add(event) {
    event.preventDefault();
    setItems((previous) => [
      ...previous,
      { lotId: selected, qty: Number(qty) },
    ]);
    setResult(null);
    setPacked(null);
  }
  function findBarcode() {
    const lot = data.lots.find((l) => l.productId?.barcode === barcode);
    if (lot) {
      setSelected(lot._id);
      setError(null);
    } else
      setError(
        new Error('No lot for this barcode is in the current store snapshot.'),
      );
  }
  async function check() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPacked(null);
    try {
      if (!navigator.onLine) {
        await saveDraft(`dispatch:${user._id}:${storeId}`, {
          orderId,
          items,
          etaMinutes: eta,
        });
        setOffline(true);
        setResult(null);
        return;
      }
      setOffline(false);
      const output = await api('/dispatch/check', {
        token,
        method: 'POST',
        body: { storeId, orderId, items, etaMinutes: Number(eta) },
      });
      setResult(output);
      if (output.blocked && navigator.vibrate) navigator.vibrate([80, 40, 80]);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function pack(event) {
    event.preventDefault();
    if (busy || !result) return;
    setBusy(true);
    setError(null);
    try {
      const output = await api('/dispatch/pack', {
        token,
        method: 'POST',
        body: {
          storeId,
          orderId,
          revision: result.revision,
          foodBagId: foodBag,
          ...(nonFoodBag && { nonFoodBagId: nonFoodBag }),
        },
      });
      setPacked(output);
      await client.invalidateQueries({ queryKey: ['overview', storeId] });
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function override() {
    setBusy(true);
    setError(null);
    try {
      const output = await api('/dispatch/override', {
        token,
        method: 'POST',
        body: { storeId, orderId, reason },
      });
      setResult({
        ...output.result,
        blocked: false,
        revision: output.revision,
        override: true,
      });
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="GATE 04 / THE LAST LINE OF DEFENCE"
        title="Safe to leave. Or stopped here."
        description="Check the exact lot at delivery time, then confirm separate bags before packing."
      />
      <div className="split-grid">
        <Panel
          title="Build the pick list"
          meta="The server re-checks safety and stock during packing."
        >
          <div className="form-grid">
            <label className="full">
              Order identifier
              <input
                value={orderId}
                maxLength={80}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  setResult(null);
                  setPacked(null);
                }}
              />
            </label>
            <label>
              Delivery ETA (minutes)
              <input
                type="number"
                min={0}
                max={180}
                value={eta}
                onChange={(e) => {
                  setEta(Number(e.target.value));
                  setResult(null);
                }}
              />
            </label>
            <label>
              Find by barcode
              <input
                inputMode="numeric"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </label>
            <button className="button secondary" onClick={findBarcode}>
              <ScanLine size={16} />
              Find lot
            </button>
          </div>
          <form className="form-grid" onSubmit={add}>
            <label className="full">
              Exact lot
              <select
                required
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data.lots.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.batchNo} · {l.productId?.name} · {l.status} · {l.qty}{' '}
                    units
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min={1}
                max={1000}
                required
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <button className="button secondary" disabled={!selected}>
              Add to order
            </button>
          </form>
          <div className="capture-pad">
            {items.map((item, index) => (
              <div className="pick-row" key={index}>
                <div>
                  <strong>{name(item.lotId)}</strong>
                  <small>
                    {item.qty} units ·{' '}
                    {data.lots.find((l) => l._id === item.lotId)?.batchNo}
                  </small>
                </div>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setItems(items.filter((_, i) => i !== index));
                    setResult(null);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="button primary"
              disabled={busy || !items.length || !orderId}
              onClick={check}
            >
              {busy ? 'Checking…' : 'Check this order'}
              <ShieldCheck size={17} />
            </button>
          </div>
        </Panel>
        <Panel title="Dispatch verdict" meta="No AI call is used in this path.">
          {error && <ErrorState error={error} />}
          <div className="capture-pad">
            {offline && (
              <p className="notice">
                Offline: pick list saved locally for reconciliation. It has not
                passed dispatch. Reconnect and run the check again.
              </p>
            )}
            {!result && !offline && (
              <div className="empty">
                <PackageCheck />
                <h3>Check the pick list to continue</h3>
                <p>
                  Quarantine, expiry, stock, temperature, sensor and FEFO checks
                  happen on the server.
                </p>
              </div>
            )}
            {result && (
              <>
                <div
                  className={`dispatch-verdict ${result.blocked ? 'blocked' : 'allowed'}`}
                >
                  {result.blocked ? (
                    <XCircle size={36} />
                  ) : (
                    <ShieldCheck size={36} />
                  )}
                  <h2>
                    {result.blocked
                      ? i18n.language === 'hi'
                        ? 'रुकें। इस ऑर्डर को पैक न करें।'
                        : 'Stop. Do not pack this order.'
                      : 'Checks passed. Confirm the bags.'}
                  </h2>
                </div>
                {result.items.map((item, index) => (
                  <div className="finding" key={index}>
                    <Pill status={item.verdict}>{item.verdict}</Pill>
                    <h3>{name(item.lotId)}</h3>
                    <ul>
                      {item.reasons.map((r) => (
                        <li key={r.code}>
                          {i18n.language === 'hi' ? r.text_hi : r.text_en}
                        </li>
                      ))}
                    </ul>
                    {item.suggestLotId && (
                      <p className="notice">
                        Suggested FEFO lot:{' '}
                        {data.lots.find(
                          (l) => l._id === String(item.suggestLotId),
                        )?.batchNo || String(item.suggestLotId)}
                      </p>
                    )}
                  </div>
                ))}
                {!result.blocked && !packed && (
                  <form className="form-grid" onSubmit={pack}>
                    <label className="full">
                      Food bag ID
                      <input
                        required
                        value={foodBag}
                        maxLength={80}
                        onChange={(e) => setFoodBag(e.target.value)}
                      />
                    </label>
                    <label className="full">
                      Non-food bag ID (required for a mixed order)
                      <input
                        value={nonFoodBag}
                        maxLength={80}
                        onChange={(e) => setNonFoodBag(e.target.value)}
                      />
                    </label>
                    <p className="notice full">
                      Food and non-food must use different bag IDs. Every pack
                      attempt re-checks the lot state.
                    </p>
                    <button className="button primary" disabled={busy}>
                      Confirm bags & pack
                    </button>
                  </form>
                )}
                {result.blocked && ['manager', 'admin'].includes(user.role) && (
                  <div>
                    <label>
                      Supervisor FEFO exception reason
                      <textarea
                        value={reason}
                        maxLength={500}
                        minLength={15}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={busy || reason.length < 15}
                      onClick={override}
                    >
                      Record FEFO exception
                    </button>
                    <p className="capture-tip">
                      Expiry, quarantine, insufficient stock and temperature
                      blocks cannot be overridden.
                    </p>
                  </div>
                )}
                {packed && (
                  <p className="notice" role="status">
                    Order {packed.orderId} packed on{' '}
                    {formatDate(packed.packedAt)}. Stock updated atomically.
                  </p>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
