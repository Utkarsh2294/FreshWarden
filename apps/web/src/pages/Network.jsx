import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api.js';
import {
  PageTitle,
  Panel,
  Pill,
  Empty,
  ErrorState,
} from '../components/Ui.jsx';
export default function Network({ token }) {
  const [city, setCity] = useState(''),
    [sort, setSort] = useState('name'),
    [days, setDays] = useState(7),
    mapNode = useRef(null),
    map = useRef(null),
    markers = useRef(null);
  const network = useQuery({
    queryKey: ['network'],
    queryFn: ({ signal }) => api('/network/health', { token, signal }),
  });
  const items = useMemo(
    () =>
      network.data?.items
        .filter((item) => !city || item.store.city === city)
        .sort((a, b) =>
          sort === 'name'
            ? a.store.name.localeCompare(b.store.name)
            : (a.health.score ?? -1) - (b.health.score ?? -1),
        ) || [],
    [network.data, city, sort],
  );
  useEffect(() => {
    if (!mapNode.current || !network.data) return;
    const instance = L.map(mapNode.current, { scrollWheelZoom: false }).setView(
      [12.94, 77.64],
      11,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(instance);
    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);
    return () => {
      instance.remove();
      map.current = null;
    };
  }, [network.data]);
  useEffect(() => {
    if (!map.current || !markers.current) return;
    markers.current.clearLayers();
    for (const item of items) {
      if (!item.store.location?.lat) continue;
      const label = document.createElement('div');
      label.textContent = `${item.store.name} · ${item.health.score === null ? 'Evidence incomplete' : `${item.health.score}/100`}`;
      L.circleMarker([item.store.location.lat, item.store.location.lng], {
        radius: 9,
        color:
          item.health.score === null
            ? '#9a8354'
            : item.health.score >= 80
              ? '#527747'
              : '#b35442',
        fillOpacity: 0.8,
      })
        .bindPopup(label)
        .addTo(markers.current);
    }
  }, [items]);
  if (network.isError)
    return <ErrorState error={network.error} retry={() => network.refetch()} />;
  const since = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10),
    trends = network.data?.trends.filter((t) => t.date >= since) || [];
  return (
    <>
      <PageTitle
        eyebrow="COMMAND CENTER / NETWORK VIEW"
        title="One watch. Across every store."
        description="See evidence coverage and repeated operational risk without inventing a clean bill of health."
      />
      <div className="zone-tabs">
        <label>
          City
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">All cities</option>
            {[...new Set(network.data?.items.map((i) => i.store.city))].map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Sort stores
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Store name</option>
            <option value="risk">Lowest health first</option>
          </select>
        </label>
      </div>
      <Panel
        title="Store coverage map"
        meta="Seeded store coordinates are synthetic demonstration locations"
      >
        <div
          ref={mapNode}
          className="network-map"
          role="img"
          aria-label="Map of stores. The same information is provided in the accessible table below."
        />
      </Panel>
      <div className="spacer" />
      <Panel
        title="Network store register"
        meta={`${items.length} stores available to this account`}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Coverage</th>
                <th>Health estimate</th>
                <th>Open incidents</th>
                <th>Dispatch blocks</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.store._id}>
                  <td>
                    <strong>{item.store.name}</strong>
                    <small>
                      {item.store.city} ·{' '}
                      {item.store.isDemo ? 'Synthetic' : 'Recorded'}
                    </small>
                  </td>
                  <td>
                    <Pill status={item.coverageComplete ? 'green' : 'amber'}>
                      {item.coverageComplete
                        ? 'Recorded'
                        : 'Incomplete evidence'}
                    </Pill>
                  </td>
                  <td>
                    {item.health.score === null
                      ? 'Not available'
                      : `${item.health.score}/100`}
                  </td>
                  <td>{item.counts.openIncidents}</td>
                  <td>{item.counts.dispatchBlocks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="spacer" />
      <Panel
        title="Recorded health history"
        meta="History starts when snapshots are generated; previous days are never backfilled with invented values"
      >
        <div className="inline-actions capture-pad">
          <button
            className="button secondary"
            onClick={() => setDays(7)}
            aria-pressed={days === 7}
          >
            7 days
          </button>
          <button
            className="button secondary"
            onClick={() => setDays(30)}
            aria-pressed={days === 30}
          >
            30 days
          </button>
        </div>
        {!trends.length ? (
          <Empty title="No recorded history yet">
            Generate snapshots to establish an evidence history.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Store</th>
                  <th>Health</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t) => (
                  <tr key={t._id}>
                    <td>{t.date}</td>
                    <td>
                      {network.data.items.find((i) => i.store._id === t.storeId)
                        ?.store.name || t.storeId}
                    </td>
                    <td>
                      {t.score === null ? 'Not available' : `${t.score}/100`}
                    </td>
                    <td>{t.status.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
