import React, { useEffect, useState } from 'react';
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
import Inward from './pages/Inward.jsx';
import Coldchain from './pages/Coldchain.jsx';
import Shelf from './pages/Shelf.jsx';
import Incidents from './pages/Incidents.jsx';
import Dispatch from './pages/Dispatch.jsx';
import Reports from './pages/Reports.jsx';
import NetworkPage from './pages/Network.jsx';
import Inspector from './pages/Inspector.jsx';
import { useRealtime } from './hooks/useRealtime.js';
import { api } from './lib/api.js';
import { Brand, ErrorState, Empty, PageTitle } from './components/Ui.jsx';
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
    queryFn: ({ signal }) => api('/me', { token, signal }),
    enabled: !!token,
    retry: false,
  });
  const stores = useQuery({
    queryKey: ['stores', token],
    queryFn: ({ signal }) => api('/stores', { token, signal }),
    enabled: !!me.data,
  });
  const selectedStore = storeId || stores.data?.[0]?._id;
  useRealtime(token, selectedStore);
  const overview = useQuery({
    queryKey: ['overview', selectedStore, token],
    queryFn: ({ signal }) =>
      api(`/stores/${selectedStore}/overview`, { token, signal }),
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
  if (location.pathname.startsWith('/inspect/'))
    return <Inspector accessToken={location.pathname.split('/')[2]} />;
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
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
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
          {navigation.map(([path, Icon, group]) => (
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
            <span className="avatar">
              {me.data?.name
                ?.split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('') || 'FW'}
            </span>
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
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
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
