import React from 'react';
import {
  ArrowRight,
  Boxes,
  ShieldCheck,
  TriangleAlert,
  Clock3,
  ScanLine,
  Thermometer,
  PackageCheck,
  ClipboardCheck,
} from 'lucide-react';
import {
  PageTitle,
  Panel,
  Pill,
  formatDate,
  Empty,
} from '../components/Ui.jsx';
import { evaluateShelfLife } from '../../../api/src/rules/shelfLife.js';
export default function Overview({ data, onNavigate }) {
  const { store, lots, productCount } = data;
  const risk = lots.filter(
    (l) =>
      l.status !== 'accepted' ||
      evaluateShelfLife({ mfgDate: l.mfgDate, expDate: l.effectiveExpDate })
        .status !== 'green',
  );
  const accepted = lots.filter((l) => l.status === 'accepted').length;
  const metrics = [
    [
      'Lots under watch',
      lots.length,
      `${lots.reduce((sum, l) => sum + l.qty, 0)} units in this store`,
      Boxes,
      'neutral',
    ],
    [
      'Accepted lots',
      accepted,
      'Approved for the next safety gate',
      ShieldCheck,
      'green',
    ],
    [
      'Needs attention',
      risk.length,
      'Review before any item moves',
      TriangleAlert,
      'amber',
    ],
    [
      'Catalog products',
      productCount,
      'Synthetic development catalog',
      Clock3,
      'neutral',
    ],
  ];
  const gates = [
    [
      'inward',
      ScanLine,
      '01',
      'Inward Gate',
      'Read the label. Check the rules.',
      'Verify a pack',
    ],
    [
      'coldchain',
      Thermometer,
      '02',
      'Cold-Chain Pulse',
      'Watch the zone. Protect its lots.',
      'View temperatures',
    ],
    [
      'shelf',
      ShieldCheck,
      '03',
      'Shelf Sentinel',
      'Find the risk. Close with proof.',
      'Inspect a shelf',
    ],
    [
      'dispatch',
      PackageCheck,
      '04',
      'Dispatch Guard',
      'A final check before it leaves.',
      'Check an order',
    ],
  ];
  return (
    <>
      <PageTitle
        eyebrow="YOUR SAFETY BRIEFING"
        title="A safer store starts here."
        description={`Here’s what needs your attention at ${store.name}.`}
      >
        <button className="button primary" onClick={() => onNavigate('inward')}>
          <ScanLine size={17} />
          Verify a pack
        </button>
      </PageTitle>
      <div className="brief-banner">
        <div className="banner-icon">
          <ShieldCheck />
        </div>
        <div>
          <strong>Eyes on every shelf. Evidence behind every decision.</strong>
          <p>
            This workspace uses synthetic development records. Rule limits need
            mentor verification.
          </p>
        </div>
        <span className="outline-label">PROTOTYPE</span>
      </div>
      <div className="metrics">
        {metrics.map(([label, value, note, Icon, color]) => (
          <section key={label} className={`metric ${color}`}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{value}</strong>
            <p>{note}</p>
          </section>
        ))}
      </div>
      <div className="overview-grid">
        <Panel
          title="Priority watchlist"
          meta={`${risk.length} lots need a closer look`}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product / batch</th>
                  <th>Zone</th>
                  <th>Effective expiry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {risk.map((l) => (
                  <tr key={l._id}>
                    <td>
                      <strong>{l.productId?.name || 'Unknown product'}</strong>
                      <small>
                        {l.batchNo} · {l.qty} units
                      </small>
                    </td>
                    <td>
                      {store.zones.find((z) => z.zoneId === l.zoneId)?.name ||
                        l.zoneId}
                    </td>
                    <td>{formatDate(l.effectiveExpDate)}</td>
                    <td>
                      <Pill status={l.status}>
                        {l.status === 'accepted' ? 'Near threshold' : l.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!risk.length && (
            <Empty title="No flagged lots">
              Continue scheduled checks to maintain coverage.
            </Empty>
          )}
          <div className="panel-foot">
            Safety first: quarantine and rejected lots cannot be dispatched.
          </div>
        </Panel>
        <Panel title="Store at a glance" meta="Zone configuration">
          <div className="zone-list">
            {store.zones.map((z) => (
              <div key={z.zoneId}>
                <span className={`zone-icon ${z.type}`}>
                  <Thermometer size={19} />
                </span>
                <div>
                  <strong>{z.name}</strong>
                  <small>{z.type} · configured range</small>
                </div>
                <b>
                  {z.limits.minC}°–{z.limits.maxC}°C
                </b>
              </div>
            ))}
          </div>
          <div className="small-notice">
            <ClipboardCheck size={17} />
            <p>
              Configured limits are prototype values. Sensor coverage is not yet
              verified.
            </p>
          </div>
        </Panel>
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">FOUR GATES. ONE SAFETY LOOP.</span>
          <h2>From dock to dispatch</h2>
        </div>
        <span className="muted">Block the error where it happens.</span>
      </div>
      <div className="gates">
        {gates.map(([path, Icon, num, title, desc, action]) => (
          <button key={path} className="gate" onClick={() => onNavigate(path)}>
            <div>
              <span className="gate-icon">
                <Icon size={22} />
              </span>
              <small>{num}</small>
            </div>
            <h3>{title}</h3>
            <p>{desc}</p>
            <span>
              {action}
              <ArrowRight size={16} />
            </span>
          </button>
        ))}
      </div>
      <div className="workspace-footer">
        <span>
          <ShieldCheck size={15} /> FreshWarden · The guardian on every shelf
        </span>
        <span>Evidence over assumptions.</span>
      </div>
    </>
  );
}
