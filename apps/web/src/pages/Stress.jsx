import React, { useState } from 'react';
import Overview from './Overview.jsx';
const names = [
  'Organic Whole Wheat Sourdough Sandwich Bread — No Added Sugar, Multigrain Seeds, Family Value Pack 1 kg',
  'शुद्ध ताज़ा दही — परिवार के लिए पौष्टिक और स्वादिष्ट',
  null,
  '👩🏽‍🍳 Artisan Bakery',
  'Jo',
  'WarehouseBatchExportReference202610210004534225009876',
];
function fixture(mode) {
  const count = {
    Demo: 6,
    'Worst case': 6,
    Empty: 0,
    One: 1,
    '1,000 rows': 1000,
  }[mode];
  return {
    store: {
      name:
        mode === 'Demo'
          ? 'Koramangala 04'
          : 'Bengaluru — Indiranagar East Extension Receiving and Fulfilment Centre',
      zones: [
        {
          zoneId: 'ambient-1',
          name: 'Ambient receiving and inspection — सामान की जाँच',
          type: 'ambient',
          limits: { minC: 15, maxC: 30 },
        },
      ],
    },
    productCount: mode === 'Demo' ? 150 : 1234567,
    lots: Array.from({ length: count }, (_, i) => ({
      _id: `stress-${i}`,
      productId: names[i % names.length]
        ? { name: names[i % names.length] }
        : null,
      batchNo: i % 2 ? '8900000000003-20261021-SUPPLIER-EXPORT-REFERENCE' : 'A',
      qty: mode === 'Demo' ? 12 : i === 1 ? 0 : 1000000,
      zoneId: 'ambient-1',
      status: ['quarantine', 'rejected', 'accepted'][i % 3],
      effectiveExpDate: i === 2 ? null : '2026-10-20',
      mfgDate: '2026-09-01',
    })),
  };
}
export default function Stress() {
  const [mode, setMode] = useState(
      new URLSearchParams(location.search).get('data') || 'Demo',
    ),
    [large, setLarge] = useState(false);
  return (
    <main className="stress-page" style={{ zoom: large ? 2 : 1 }}>
      <p className="notice">
        Development UI stress fixture · no API writes. Navigation is disabled in
        this fixture.
      </p>
      <Overview key={mode} data={fixture(mode)} onNavigate={() => {}} />
      <div className="stress-toggle" aria-label="Stress dataset">
        {['Demo', 'Worst case', 'Empty', 'One', '1,000 rows'].map((label) => (
          <button
            key={label}
            aria-pressed={mode === label}
            onClick={() => {
              setMode(label);
              history.replaceState(
                null,
                '',
                `?data=${encodeURIComponent(label)}`,
              );
            }}
          >
            {label}
          </button>
        ))}
        <button aria-pressed={large} onClick={() => setLarge(!large)}>
          200% scale
        </button>
      </div>
    </main>
  );
}
