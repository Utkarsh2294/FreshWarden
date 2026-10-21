import React, { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  ScanLine,
  Thermometer,
  ShieldCheck,
  PackageCheck,
  CircleAlert,
  FileCheck2,
  Network,
  LogOut,
  ChevronDown,
  Bell,
  ArrowUpRight,
  Menu,
  X,
  Search,
} from 'lucide-react';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
const Inward = lazy(() => import('./pages/Inward.jsx'));
const Coldchain = lazy(() => import('./pages/Coldchain.jsx'));
const Shelf = lazy(() => import('./pages/Shelf.jsx'));
const Incidents = lazy(() => import('./pages/Incidents.jsx'));
const Dispatch = lazy(() => import('./pages/Dispatch.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const NetworkPage = lazy(() => import('./pages/Network.jsx'));
const Inspector = lazy(() => import('./pages/Inspector.jsx'));
const Status = lazy(() => import('./pages/Status.jsx'));
import { useRealtime } from './hooks/useRealtime.js';
import { api } from './lib/api.js';
import { cachedOverview, cachedSession } from './lib/outbox.js';
import SyncStatus from './components/SyncStatus.jsx';
import { Brand, ErrorState, Empty, PageTitle } from './components/Ui.jsx';
import { initials } from './lib/display.js';
const Stress = import.meta.env.DEV
  ? lazy(() => import('./pages/Stress.jsx'))
  : null;
const navigation = [
  ['overview', LayoutDashboard, 'WORKSPACE'],
  ['inward', ScanLine],
  ['coldchain', Thermometer],
  ['shelf', ShieldCheck],
  ['dispatch', PackageCheck],
  ['incidents', CircleAlert, 'OVERSIGHT'],
  ['reports', FileCheck2],
  ['network', Network],
];
export default function App() {
  const sidebar = useRef(null),
    menuTrigger = useRef(null);
  const [token, setToken] = useState(
      () => sessionStorage.getItem('fw-token') || '',
    ),
    [storeId, setStoreId] = useState(''),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState('');
  const { t, i18n } = useTranslation(),
    client = useQueryClient(),
    navigate = useNavigate(),
    location = useLocation();
  const page = location.pathname.slice(1) || 'overview';
  function login(value) {
    sessionStorage.setItem('fw-token', value);
    setToken(value);
  }
  function logout() {
    sessionStorage.removeItem('fw-token');
    setToken('');
    setStoreId('');
    client.clear();
  }
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: ({ signal }) =>
      cachedSession('/me', token, () => api('/me', { token, signal })),
    networkMode: 'always',
    enabled: !!token,
    retry: false,
  });
  const stores = useQuery({
    queryKey: ['stores', token],
    queryFn: ({ signal }) =>
      cachedSession('/stores', token, () => api('/stores', { token, signal })),
    networkMode: 'always',
    enabled: !!me.data,
  });
  const selectedStore = storeId || stores.data?.[0]?._id;
  useRealtime(token, selectedStore);
  const overview = useQuery({
    networkMode: 'always',
    queryKey: ['overview', selectedStore, token],
    queryFn: ({ signal }) =>
      cachedOverview(`${me.data._id}:${selectedStore}`, () =>
        api(`/stores/${selectedStore}/overview`, { token, signal }),
      ),
    enabled: !!selectedStore,
  });
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    localStorage.setItem('fw-language', i18n.language);
  }, [i18n.language]);
  useEffect(() => {
    if (me.error?.status === 401) {
      sessionStorage.removeItem('fw-token');
      setToken('');
      client.clear();
    }
  }, [me.error, client]);
  useEffect(() => {
    if (!menu) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuTrigger.current;
    document.body.style.overflow = 'hidden';
    const controls = () =>
      [...sidebar.current.querySelectorAll('button, a[href]')].filter(
        (node) => !node.disabled && node.getClientRects().length,
      );
    controls()[0]?.focus();
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false);
      }
      if (event.key !== 'Tab') return;
      const nodes = controls(),
        first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const resize = () => {
      if (window.innerWidth > 800) setMenu(false);
    };
    document.addEventListener('keydown', keydown);
    window.addEventListener('resize', resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', resize);
      trigger?.focus();
    };
  }, [menu]);
  if (Stress && location.pathname === '/__stress')
    return (
      <Suspense fallback={<p role="status">Loading stress fixture…</p>}>
        <Stress />
      </Suspense>
    );
  if (location.pathname === '/status')
    return (
      <Suspense fallback={<p role="status">Loading status…</p>}>
        <Status />
      </Suspense>
    );
  if (location.pathname.startsWith('/inspect/'))
    return (
      <Suspense fallback={<p role="status">Loading shared report…</p>}>
        <Inspector accessToken={location.pathname.split('/')[2]} />
      </Suspense>
    );
  if (!token) return <Login onLogin={login} />;
  const go = (path) => {
    navigate(`/${path}`);
    setMenu(false);
    setSearch('');
  };
  const data = overview.data;
  return (
    <div className="app-shell">
      <a className="skip" href="#content">
        Skip to main content
      </a>
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="main-navigation"
        className={`sidebar ${menu ? 'open' : ''}`}
        role={menu ? 'dialog' : undefined}
        aria-modal={menu || undefined}
        aria-label="Store navigation"
      >
        <Brand />
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          <span className="workspace-avatar">FW</span>
          <div>
            <strong>Store workspace</strong>
            <small>Development environment</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Main navigation">
          {navigation
            .filter(
              ([path]) =>
                path !== 'network' || ['area', 'admin'].includes(me.data?.role),
            )
            .map(([path, Icon, group]) => (
              <React.Fragment key={path}>
                {group && <span className="nav-group">{group}</span>}
                <button
                  className={`nav-item ${page === path ? 'active' : ''}`}
                  onClick={() => go(path)}
                  aria-current={page === path ? 'page' : undefined}
                >
                  <Icon size={19} />
                  {t(path)}
                  {path === 'inward' && <span className="nav-tag">SCAN</span>}
                </button>
              </React.Fragment>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="watch-note">
            <ShieldCheck size={20} />
            <strong>
              Small checks.
              <br />
              Safer shelves.
            </strong>
            <p>Every intervention starts with evidence.</p>
            <a
              href="https://github.com/Utkarsh2294/FreshWarden"
              target="_blank"
              rel="noreferrer"
            >
              Project documentation
              <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="profile">
            <span className="avatar">{initials(me.data?.name)}</span>
            <div>
              <strong>{me.data?.name || 'Loading…'}</strong>
              <small>{me.data?.role || 'Account'}</small>
            </div>
            <button
              className="icon-button"
              aria-label={t('signout')}
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={menu ? '' : undefined}>
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              ref={menuTrigger}
              aria-expanded={menu}
              aria-controls="main-navigation"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{t(page)}</strong>
          </div>
          <div className="topbar-actions">
            <label className="store-select">
              <span className="live-dot" />
              <select
                aria-label="Active store"
                value={selectedStore || ''}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.data?.map((store) => (
                  <option key={store._id} value={store._id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="language"
              onClick={() =>
                i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en')
              }
              aria-label="Switch language"
            >
              {i18n.language === 'en' ? 'हिन्दी' : 'English'}
            </button>
            <button
              className="icon-button notification"
              onClick={() => go('incidents')}
              aria-label="Open incidents"
            >
              <Bell size={19} />
            </button>
          </div>
        </header>
        <main id="content">
          <div className="context-bar">
            <span>
              <span className="live-dot" />
              SYNTHETIC DEMO DATA
            </span>
            <span>
              {new Intl.DateTimeFormat('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                timeZone: 'Asia/Kolkata',
              }).format(new Date())}
            </span>
          </div>
          {me.data && selectedStore && (
            <SyncStatus
              key={`${me.data._id}:${selectedStore}`}
              userId={me.data._id}
              storeId={selectedStore}
              token={token}
            />
          )}
          {data?.offlineSnapshotAt && (
            <p className="notice" role="status">
              Read-only saved inventory · last synced{' '}
              {new Date(data.offlineSnapshotAt).toLocaleString('en-IN')}. Lot
              status on the server wins. Reconnect before any approval or
              dispatch.
            </p>
          )}
          <Suspense
            fallback={
              <div className="loading" role="status">
                {t('loading')}
              </div>
            }
          >
            {me.isError ? (
              <ErrorState error={me.error} retry={() => me.refetch()} />
            ) : stores.isError ? (
              <ErrorState error={stores.error} retry={() => stores.refetch()} />
            ) : overview.isError ? (
              <ErrorState
                error={overview.error}
                retry={() => overview.refetch()}
              />
            ) : !data ? (
              <div className="loading" role="status">
                {t('loading')}
              </div>
            ) : page === 'overview' ? (
              <Overview data={data} onNavigate={go} />
            ) : page === 'inward' ? (
              <Inward
                key={selectedStore}
                data={data}
                token={token}
                user={me.data}
              />
            ) : page === 'coldchain' ? (
              <Coldchain
                key={selectedStore}
                data={data}
                token={token}
                user={me.data}
              />
            ) : page === 'shelf' ? (
              <Shelf
                key={selectedStore}
                data={data}
                token={token}
                user={me.data}
              />
            ) : page === 'incidents' ? (
              <Incidents
                key={selectedStore}
                data={data}
                token={token}
                user={me.data}
              />
            ) : page === 'dispatch' ? (
              <Dispatch
                key={selectedStore}
                data={data}
                token={token}
                user={me.data}
              />
            ) : page === 'reports' ? (
              <Reports
                key={selectedStore}
                data={data}
                token={token}
                user={me.data}
              />
            ) : page === 'network' ? (
              <NetworkPage token={token} />
            ) : (
              <>
                <PageTitle
                  title={t(page)}
                  description="This module is scheduled in the source plan."
                />
                <Empty
                  title={`Phase ${{ inward: 2, coldchain: 3, shelf: 4, dispatch: 5, incidents: 4, reports: 6, network: 6 }[page] || 1} — not available yet`}
                >
                  This phase has not been implemented. No simulated safety
                  decisions are generated here.
                </Empty>
              </>
            )}
          </Suspense>
          <div className="quick-search">
            <Search size={16} />
            <input
              aria-label="Find a module"
              placeholder="Jump to a module…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <div>
                {navigation
                  .filter(([path]) =>
                    t(path).toLowerCase().includes(search.toLowerCase()),
                  )
                  .map(([path]) => (
                    <button key={path} onClick={() => go(path)}>
                      {t(path)}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
