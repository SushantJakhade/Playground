import {
  DashboardManifest,
  DashboardMeta,
  RoleConfig,
  ViewConfig,
} from '../types';

interface AppSidebarProps {
  manifest: DashboardManifest;
  meta: DashboardMeta;
  role: RoleConfig;
  view: ViewConfig;
}

export function AppSidebar({ manifest, meta, role, view }: AppSidebarProps) {
  const roleCount = Object.keys(manifest.roles).length;
  const viewCount = role.views.length;
  const widgetCount = view.widgets.length;
  const generatedAt = new Date(meta.generatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <aside className="sidebar-panel" aria-label="Dashboard system overview">
      <div className="sidebar-topline">
        <p className="sidebar-kicker">Role-based dashboard system</p>
        <span className="status-badge">API live</span>
      </div>
      <h1>{manifest.title}</h1>
      <p className="sidebar-copy">{manifest.description}</p>

      <div className="sidebar-pillbar" aria-label="Framework metrics">
        <div className="sidebar-pill">
          <strong>{roleCount}</strong>
          <span>roles</span>
        </div>
        <div className="sidebar-pill">
          <strong>{viewCount}</strong>
          <span>views</span>
        </div>
        <div className="sidebar-pill">
          <strong>{widgetCount}</strong>
          <span>widgets</span>
        </div>
      </div>

      <section className="sidebar-section">
        <p className="sidebar-label">Data source</p>
        <div className="sidebar-card">
          <strong>{meta.seeded ? 'Seed-backed API' : meta.source}</strong>
          <p>The frontend now loads the role manifest and datasets from the backend.</p>
          <small>Last payload generated at {generatedAt}</small>
        </div>
      </section>

      <section className="sidebar-section">
        <p className="sidebar-label">Active role</p>
        <h2>{role.label}</h2>
        <p>{role.description}</p>
        <div className="tag-row" aria-label="Role capabilities">
          {role.capabilities.map((capability) => (
            <span className="tag" key={capability}>
              {capability}
            </span>
          ))}
        </div>
      </section>

      <section className="sidebar-section sidebar-section--code">
        <p className="sidebar-label">Resolution flow</p>
        <div className="code-line">GET /api/dashboard/bootstrap</div>
        <div className="code-line">role.{role.id}</div>
        <div className="code-line">view.{view.id}</div>
        <div className="code-line">widget-registry.resolve()</div>
      </section>

      <section className="sidebar-section">
        <p className="sidebar-label">Extension rule</p>
        <ul className="sidebar-list">
          <li>Add roles in the manifest.</li>
          <li>Bind view datasets through ids.</li>
          <li>Reuse widgets before adding new ones.</li>
        </ul>
      </section>
    </aside>
  );
}
