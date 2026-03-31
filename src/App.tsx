import {
  CSSProperties,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
} from 'react';
import { AppSidebar } from './components/AppSidebar';
import { DashboardGrid } from './components/DashboardGrid';
import { AdminPanel } from './components/AdminPanel';
import { fetchDashboardBootstrap } from './lib/api';
import { DashboardBootstrap, RoleId, RoleConfig, ViewConfig } from './types';

const ADMIN_MANAGE_VIEW_ID = '__admin-manage__';

/** Filter out disabled views and widgets for non-admin roles */
function filterRole(role: RoleConfig): RoleConfig {
  return {
    ...role,
    views: role.views
      .filter((v) => !v.disabled)
      .map((v) => ({
        ...v,
        widgets: v.widgets.filter((w) => !(w as any).disabled),
      })),
  };
}

export function App() {
  const [bootstrap, setBootstrap] = useState<DashboardBootstrap | null>(null);
  const [activeRoleId, setActiveRoleId] = useState<RoleId>('');
  const [activeViewId, setActiveViewId] = useState('');
  const [query, setQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

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
    refreshTimer = setInterval(() => loadDashboard(true), 5_000);

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

  const isAdmin = activeRoleId === 'admin';
  // Admin sees full manifest; other roles get disabled items filtered out
  const activeRole = isAdmin
    ? (manifest.roles[activeRoleId] ?? fallbackRole)
    : filterRole(manifest.roles[activeRoleId] ?? fallbackRole);

  const showAdminPanel = isAdmin && activeViewId === ADMIN_MANAGE_VIEW_ID;
  const activeView = showAdminPanel
    ? ({ id: ADMIN_MANAGE_VIEW_ID, label: 'Manage', title: 'Role & Permission Manager', summary: 'Control what other roles can see and access.', widgets: [] } as ViewConfig)
    : (activeRole.views.find((view) => view.id === activeViewId) ?? activeRole.views[0]);

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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function scrollToWidget(widgetId: string) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-widget-id="${widgetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('widget-highlight');
        setTimeout(() => el.classList.remove('widget-highlight'), 2000);
      }
    });
  }

  function navigateToView(viewId: string, targetWidget?: string) {
    startTransition(() => {
      setActiveViewId(viewId);
    });
    if (targetWidget) {
      setTimeout(() => scrollToWidget(targetWidget), 350);
    }
  }

  function exportTableAsCSV(datasetId: string, filename: string) {
    const rows = data.tables[datasetId];
    if (!rows || rows.length === 0) { showToast('No data to export'); return; }
    const keys = Object.keys(rows[0]).filter((k) => k !== 'id');
    const header = keys.join(',');
    const body = rows.map((r) => keys.map((k) => `"${r[k]}"`).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}.csv`);
  }

  function handleAction(action: string) {
    switch (action) {
      // ── Admin Command ──
      case 'Inspect contracts':
        navigateToView(ADMIN_MANAGE_VIEW_ID);
        showToast('Opened role contracts in Manage panel');
        break;
      case 'Review drift':
        navigateToView('command', 'adminTrend');
        showToast('Scrolled to operational health trend');
        break;
      case 'Open queue':
        navigateToView('command', 'adminFeed');
        showToast('Scrolled to live exceptions queue');
        break;

      // ── Admin Governance ──
      case 'Draft a new role':
        navigateToView(ADMIN_MANAGE_VIEW_ID);
        showToast('Opened Manage panel — configure a new role');
        break;
      case 'Validate a view':
        navigateToView(ADMIN_MANAGE_VIEW_ID);
        showToast('Opened Manage panel — review view status');
        break;
      case 'Compare contracts':
        navigateToView(ADMIN_MANAGE_VIEW_ID);
        showToast('Opened Manage panel — compare role contracts');
        break;

      // ── Analyst Signal Desk ──
      case 'Inspect outliers':
        scrollToWidget('analystTrend');
        showToast('Focused on signal quality trend — check outliers');
        break;
      case 'Save insight':
        exportTableAsCSV('modelSegments', 'analyst-segments-insight');
        break;
      case 'Share snapshot': {
        const url = `${window.location.origin}?role=analyst&view=signal-desk`;
        navigator.clipboard.writeText(url).then(() => {
          showToast('Snapshot URL copied to clipboard');
        }).catch(() => {
          showToast('Snapshot ready — URL: ' + url);
        });
        break;
      }

      // ── Analyst Exploration ──
      case 'Create watchlist':
        setQuery('');
        scrollToWidget('analystExplorationTable');
        showToast('Scrolled to segment table — use search to build your watchlist');
        break;
      case 'Export comparison':
        exportTableAsCSV('modelSegments', 'analyst-comparison-export');
        break;
      case 'Open notebook':
        navigateToView('signal-desk', 'analystTrend');
        showToast('Opened Signal Desk trend for notebook reference');
        break;

      // ── Business Portfolio ──
      case 'Review priorities':
        scrollToWidget('businessComparison');
        showToast('Focused on portfolio contribution priorities');
        break;
      case 'Align planning':
        navigateToView('planning');
        showToast('Switched to Planning Review');
        break;
      case 'Share outlook': {
        const bizUrl = `${window.location.origin}?role=business&view=portfolio`;
        navigator.clipboard.writeText(bizUrl).then(() => {
          showToast('Portfolio outlook URL copied to clipboard');
        }).catch(() => {
          showToast('Outlook ready — URL: ' + bizUrl);
        });
        break;
      }

      // ── Business Planning ──
      case 'Adjust targets':
        scrollToWidget('businessPlanningTargets');
        showToast('Focused on planning targets');
        break;
      case 'Open risks':
        scrollToWidget('businessPlanningTable');
        showToast('Focused on planning ledger — review risk items');
        break;
      case 'Publish summary':
        exportTableAsCSV('initiativeLedger', 'business-planning-summary');
        break;

      default:
        showToast(`Action: ${action}`);
    }
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
              {isAdmin && (
                <button
                  aria-current={activeViewId === ADMIN_MANAGE_VIEW_ID ? 'page' : undefined}
                  className="tab-button tab-button--admin"
                  onClick={() => handleViewChange(ADMIN_MANAGE_VIEW_ID)}
                  type="button"
                >
                  Manage
                </button>
              )}
            </nav>
          </section>

          {showAdminPanel ? (
            <AdminPanel manifest={manifest} onRefresh={triggerRefresh} />
          ) : (
            <DashboardGrid
              data={data}
              manifest={manifest}
              query={deferredQuery}
              role={activeRole}
              view={activeView}
              onAction={handleAction}
            />
          )}
        </main>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
