import {
  CSSProperties,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react';
import { AppSidebar } from './components/AppSidebar';
import { DashboardGrid } from './components/DashboardGrid';
import { fetchDashboardBootstrap } from './lib/api';
import { DashboardBootstrap, RoleId } from './types';

export function App() {
  const [bootstrap, setBootstrap] = useState<DashboardBootstrap | null>(null);
  const [activeRoleId, setActiveRoleId] = useState<RoleId>('');
  const [activeViewId, setActiveViewId] = useState('');
  const [query, setQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    async function loadDashboard(isRefresh = false) {
      if (!isRefresh) setErrorMessage('');

      try {
        const nextBootstrap = await fetchDashboardBootstrap(controller.signal);
        const nextRoles = Object.values(nextBootstrap.manifest.roles);
        const initialRole = nextRoles[0];

        if (!initialRole) {
          throw new Error('Dashboard manifest does not contain any roles.');
        }

        setBootstrap(nextBootstrap);
        if (!isRefresh) {
          startTransition(() => {
            setActiveRoleId(initialRole.id);
            setActiveViewId(initialRole.defaultViewId);
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (!isRefresh) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to load the dashboard bootstrap payload.';
          setErrorMessage(message);
        }
      }
    }

    loadDashboard();

    // Auto-refresh every 60 seconds for live data
    refreshTimer = setInterval(() => loadDashboard(true), 60_000);

    return () => {
      controller.abort();
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [refreshKey]);

  if (!bootstrap) {
    return (
      <div className="status-screen">
        <div className="status-card">
          <p className="status-card__eyebrow">
            {errorMessage ? 'Backend unavailable' : 'Connecting to dashboard API'}
          </p>
          <h1>{errorMessage ? 'The dashboard could not load.' : 'Loading dashboard system.'}</h1>
          <p>
            {errorMessage ||
              'Fetching the role manifest and shared data catalog from the backend.'}
          </p>
          {errorMessage ? (
            <button
              className="primary-button"
              onClick={() => setRefreshKey((value) => value + 1)}
              type="button"
            >
              Retry API request
            </button>
          ) : (
            <div className="loading-bar" aria-hidden="true" />
          )}
        </div>
      </div>
    );
  }

  const manifest = bootstrap.manifest;
  const data = bootstrap.data;
  const roleEntries = Object.values(manifest.roles);
  const fallbackRole = roleEntries[0];

  if (!fallbackRole) {
    return (
      <div className="status-screen">
        <div className="status-card">
          <p className="status-card__eyebrow">Manifest error</p>
          <h1>The backend returned an empty role list.</h1>
          <p>Add at least one role to the manifest before rendering the dashboard.</p>
        </div>
      </div>
    );
  }

  const activeRole = manifest.roles[activeRoleId] ?? fallbackRole;
  const activeView =
    activeRole.views.find((view) => view.id === activeViewId) ??
    activeRole.views[0];

  function handleRoleChange(roleId: RoleId) {
    startTransition(() => {
      setActiveRoleId(roleId);
      setActiveViewId(manifest.roles[roleId].defaultViewId);
    });
  }

  function handleViewChange(viewId: string) {
    startTransition(() => {
      setActiveViewId(viewId);
    });
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div
        className="app-shell"
        style={
          {
            '--accent': activeRole.theme.accent,
            '--accent-soft': activeRole.theme.accentSoft,
            '--accent-strong': activeRole.theme.accentStrong,
            '--signal': activeRole.theme.signal,
          } as CSSProperties
        }
      >
        <AppSidebar
          manifest={manifest}
          meta={bootstrap.meta}
          role={activeRole}
          view={activeView}
        />

        <main className="main-panel" id="main-content">
          <header className="top-panel">
            <div className="top-panel__cluster">
              <div>
                <p className="top-panel__eyebrow">{activeRole.accentLabel}</p>
                <h2>{activeView.title}</h2>
                <p>{activeView.summary}</p>
              </div>

              <div className="top-panel__meta" aria-label="API status">
                <span className="status-chip">Backend live</span>
                <span className={`status-chip ${bootstrap.meta.seeded ? 'status-chip--muted' : 'status-chip--live'}`}>
                  {bootstrap.meta.seeded
                    ? 'Demo data'
                    : `Live · ${bootstrap.meta.dataSources?.join(', ') ?? bootstrap.meta.source}`}
                </span>
                {bootstrap.meta.warning && (
                  <span className="status-chip status-chip--muted" title={bootstrap.meta.warning}>
                    Partial fallback
                  </span>
                )}
              </div>
            </div>

            <label className="search-field">
              <span>Search tables and feeds</span>
              <input
                aria-label="Search current dashboard"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter events, rows, and notes"
                type="search"
                value={query}
              />
            </label>
          </header>

          <section aria-label="Role selector" className="control-row">
            <div className="control-group">
              {roleEntries.map((role) => (
                <button
                  aria-pressed={role.id === activeRole.id}
                  className="segmented-button"
                  key={role.id}
                  onClick={() => handleRoleChange(role.id)}
                  type="button"
                >
                  <strong>{role.label}</strong>
                  <span>{role.summary}</span>
                </button>
              ))}
            </div>

            <nav aria-label="View selector" className="view-tabs">
              {activeRole.views.map((view) => (
                <button
                  aria-current={view.id === activeView.id ? 'page' : undefined}
                  className="tab-button"
                  key={view.id}
                  onClick={() => handleViewChange(view.id)}
                  type="button"
                >
                  {view.label}
                </button>
              ))}
            </nav>
          </section>

          <DashboardGrid
            data={data}
            manifest={manifest}
            query={deferredQuery}
            role={activeRole}
            view={activeView}
          />
        </main>
      </div>
    </>
  );
}
