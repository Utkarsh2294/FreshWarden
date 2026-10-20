import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Thermometer,
  Radio,
  ThermometerSnowflake,
  FlaskConical,
  KeyRound,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { api } from '../lib/api.js';
import {
  PageTitle,
  Panel,
  Pill,
  Empty,
  ErrorState,
  formatDate,
} from '../components/Ui.jsx';
export default function Coldchain({ data, token, user }) {
  const storeId = data.store._id,
    client = useQueryClient(),
    [zoneId, setZoneId] = useState(data.store.zones[0].zoneId),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(null),
    [deviceId, setDeviceId] = useState(''),
    [deviceKey, setDeviceKey] = useState('');
  const zone = data.store.zones.find((z) => z.zoneId === zoneId),
    manager = ['manager', 'admin'].includes(user.role);
  const snapshot = useQuery({
    queryKey: ['coldchain', storeId, zoneId],
    queryFn: ({ signal }) =>
      api(`/zones/${zoneId}/readings?storeId=${storeId}`, { token, signal }),
    refetchInterval: 30000,
  });
  const state = snapshot.data,
    latest = state?.readings.at(-1),
    affected = data.lots.filter((l) => l.zoneId === zoneId);
  async function simulate(scenario) {
    if (busy) return;
    setBusy(scenario);
    setError(null);
    try {
      await api('/coldchain/simulate', {
        token,
        method: 'POST',
        body: { storeId, zoneId, scenario },
      });
      await snapshot.refetch();
      await client.invalidateQueries({ queryKey: ['overview', storeId] });
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }
  async function register(event) {
    event.preventDefault();
    setBusy('register');
    setError(null);
    try {
      const result = await api('/sensors', {
        token,
        method: 'POST',
        body: { storeId, zoneId, deviceId },
      });
      setDeviceKey(result.key);
      await snapshot.refetch();
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }
  async function rotate() {
    setBusy('rotate');
    try {
      const result = await api(`/sensors/${state.sensor._id}/rotate-key`, {
        token,
        method: 'POST',
        body: {},
      });
      setDeviceKey(result.key);
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="GATE 02 / THE COLD CHAIN"
        title="Every degree tells a story."
        description="Connect temperature exposure to the lots it puts at risk."
      />
      <div className="zone-tabs" role="group" aria-label="Select storage zone">
        {data.store.zones.map((z) => (
          <button
            key={z.zoneId}
            className={`button ${zoneId === z.zoneId ? 'primary' : 'secondary'}`}
            onClick={() => {
              setZoneId(z.zoneId);
              setDeviceKey('');
            }}
          >
            <Thermometer size={16} />
            {z.name}
          </button>
        ))}
      </div>
      {error && <ErrorState error={error} />}
      <div className="metrics">
        <section className="metric">
          <div>
            <span>Latest temperature</span>
            <Thermometer size={18} />
          </div>
          <strong>{latest ? `${latest.tempC.toFixed(1)}°C` : '—'}</strong>
          <p>
            {latest
              ? new Date(latest.ts).toLocaleTimeString('en-IN')
              : 'No telemetry received'}
          </p>
        </section>
        <section className="metric">
          <div>
            <span>Configured range</span>
            <ThermometerSnowflake size={18} />
          </div>
          <strong className="smaller">
            {zone.limits.minC}°–{zone.limits.maxC}°
          </strong>
          <p>Prototype values · mentor review required</p>
        </section>
        <section className="metric">
          <div>
            <span>Sensor coverage</span>
            <Radio size={18} />
          </div>
          <strong className="smaller">{state?.status || 'Checking'}</strong>
          <p>{state?.sensor?.deviceId || 'Register a zone sensor'}</p>
        </section>
        <section className="metric amber">
          <div>
            <span>Lots in this zone</span>
            <FlaskConical size={18} />
          </div>
          <strong>{affected.length}</strong>
          <p>
            {affected.filter((l) => l.status === 'quarantine').length} held for
            review
          </p>
        </section>
      </div>
      <Panel
        title={`${zone.name} · temperature trace`}
        meta="Last 120 readings · threshold lines are configurable, not legally verified"
      >
        {snapshot.isError ? (
          <ErrorState error={snapshot.error} retry={() => snapshot.refetch()} />
        ) : !state?.readings.length ? (
          <Empty title="Waiting for the first reading">
            Register a sensor, or use the labelled development simulator below.
          </Empty>
        ) : (
          <div
            className="chart"
            role="img"
            aria-label={`Temperature readings for ${zone.name}, latest ${latest.tempC} degrees Celsius`}
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={state.readings.map((r) => ({
                  ...r,
                  time: new Date(r.ts).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }))}
                margin={{ top: 20, right: 30, bottom: 10, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" minTickGap={55} tick={{ fontSize: 10 }} />
                <YAxis
                  domain={['auto', 'auto']}
                  unit="°"
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <ReferenceLine
                  y={zone.limits.maxC}
                  stroke="#bd743c"
                  strokeDasharray="5 5"
                  label={{
                    value: 'Upper limit',
                    position: 'insideTopRight',
                    fontSize: 10,
                  }}
                />
                <ReferenceLine
                  y={zone.limits.minC}
                  stroke="#8aa7aa"
                  strokeDasharray="5 5"
                />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="tempC"
                  stroke="#3c735b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
      <div className="spacer" />
      <Panel
        title="Excursions & estimated shelf-life debit"
        meta="Sustained exposure opens a hold. Recovery keeps lots in quarantine for supervisor review."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Peak</th>
                <th>Outside range</th>
                <th>Estimated debit</th>
                <th>Status</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {state?.excursions.map((e) => (
                <tr key={e._id}>
                  <td>{formatDate(e.startedAt)}</td>
                  <td>{e.peakC.toFixed(1)}°C</td>
                  <td>{e.minutesOutside.toFixed(1)} min</td>
                  <td>{e.debitDays.toFixed(4)} days</td>
                  <td>
                    <Pill status={e.status === 'open' ? 'red' : 'amber'}>
                      {e.status}
                    </Pill>
                  </td>
                  <td>{e.isDemo ? 'Simulated' : 'Sensor'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state && !state.excursions.length && (
          <p className="panel-foot">
            No sustained excursion recorded. Missing readings do not prove safe
            storage.
          </p>
        )}
      </Panel>
      <div className="spacer" />
      <Panel
        title="Affected inventory"
        meta="Original and effective expiry stay visible"
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product / batch</th>
                <th>Original expiry</th>
                <th>Effective expiry</th>
                <th>Estimated debit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {affected.map((l) => (
                <tr key={l._id}>
                  <td>
                    <strong>{l.productId?.name}</strong>
                    <small>{l.batchNo}</small>
                  </td>
                  <td>{formatDate(l.expDate)}</td>
                  <td>{formatDate(l.effectiveExpDate)}</td>
                  <td>{(l.thermalDebitDays || 0).toFixed(4)} days</td>
                  <td>
                    <Pill status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {manager && (
        <>
          <div className="spacer" />
          <Panel
            title="Sensor connection"
            meta="Device keys are stored hashed. Copy a newly issued key once into the device environment."
          >
            {!state?.sensor ? (
              <form className="form-grid" onSubmit={register}>
                <label>
                  Device identifier
                  <input
                    required
                    pattern="[a-zA-Z0-9-]{1,60}"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="esp-chiller-01"
                  />
                </label>
                <button className="button secondary" disabled={!!busy}>
                  <KeyRound size={16} />
                  Register sensor
                </button>
              </form>
            ) : (
              <div className="capture-pad">
                <p>
                  {state.sensor.deviceId} ·{' '}
                  {state.sensor.isDemo
                    ? 'Development simulator'
                    : 'Registered device'}
                </p>
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={rotate}
                >
                  Rotate device key
                </button>
              </div>
            )}
            {deviceKey && (
              <div className="capture-pad">
                <label>
                  New device key (shown once)
                  <input type="password" readOnly value={deviceKey} />
                </label>
                <button
                  className="button secondary"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(deviceKey)
                      .catch(() =>
                        setError(
                          new Error(
                            'Clipboard unavailable. Select and copy the key field.',
                          ),
                        ),
                      )
                  }
                >
                  Copy device key
                </button>
              </div>
            )}
          </Panel>
          {import.meta.env.DEV && (
            <div className="simulation-panel">
              <span className="eyebrow">
                DEVELOPMENT ONLY / SIMULATED TELEMETRY
              </span>
              <h3>Exercise the cold-chain loop</h3>
              <p>
                Writes a labelled 20-minute historical trace. This is not a
                hardware measurement.
              </p>
              <div>
                {['normal', 'door-open', 'compressor-fail', 'sensor-dead'].map(
                  (s) => (
                    <button
                      key={s}
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => simulate(s)}
                    >
                      {busy === s ? 'Running…' : s.replaceAll('-', ' ')}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
