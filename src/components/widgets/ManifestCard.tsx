import { DashboardManifest, RoleConfig, ViewConfig } from '../../types';
import { WidgetFrame } from '../WidgetFrame';
import type { ManifestWidget } from '../../types';

interface ManifestCardProps {
  widget: ManifestWidget;
  manifest: DashboardManifest;
  role: RoleConfig;
  view: ViewConfig;
}

export function ManifestCard({
  widget,
  manifest,
  role,
  view,
}: ManifestCardProps) {
  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      summary="The role, view, and widget registry stay loosely coupled so new combinations ship without rewriting the shell."
    >
      <div className="manifest-card">
        <div className="code-line">framework.title = "{manifest.title}"</div>
        <div className="code-line">active.role = "{role.id}"</div>
        <div className="code-line">active.view = "{view.id}"</div>
        <div className="code-line">widget.count = {view.widgets.length}</div>

        <div className="manifest-notes">
          {widget.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}
