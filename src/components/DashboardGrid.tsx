import { CSSProperties } from 'react';
import { DataCatalog, DashboardManifest, RoleConfig, ViewConfig } from '../types';
import { HeroPanel } from './widgets/HeroPanel';
import { MetricStrip } from './widgets/MetricStrip';
import { TrendChartCard } from './widgets/TrendChartCard';
import { ComparisonChartCard } from './widgets/ComparisonChartCard';
import { BulletListCard } from './widgets/BulletListCard';
import { ActivityFeedCard } from './widgets/ActivityFeedCard';
import { DataTableCard } from './widgets/DataTableCard';
import { ManifestCard } from './widgets/ManifestCard';
import { SpotlightCard } from './widgets/SpotlightCard';
import { DashboardWidget } from '../types';

interface DashboardGridProps {
  manifest: DashboardManifest;
  role: RoleConfig;
  view: ViewConfig;
  data: DataCatalog;
  query: string;
}

function spanClass(widget: DashboardWidget) {
  switch (widget.span) {
    case 'compact':
      return 'dashboard-grid__item dashboard-grid__item--compact';
    case 'balanced':
      return 'dashboard-grid__item dashboard-grid__item--balanced';
    case 'wide':
      return 'dashboard-grid__item dashboard-grid__item--wide';
    default:
      return 'dashboard-grid__item dashboard-grid__item--full';
  }
}

export function DashboardGrid({
  manifest,
  role,
  view,
  data,
  query,
}: DashboardGridProps) {
  return (
    <div className="dashboard-grid">
      {view.widgets.map((widget, index) => {
        const style = {
          '--delay': `${index * 50}ms`,
        } as CSSProperties;

        let content;

        switch (widget.kind) {
          case 'hero':
            content = (
              <HeroPanel
                widget={widget}
                role={role}
                metrics={widget.statIds.map((id) => data.metrics[id])}
              />
            );
            break;
          case 'metric-strip':
            content = (
              <MetricStrip
                widget={widget}
                metrics={widget.metricIds.map((id) => data.metrics[id])}
              />
            );
            break;
          case 'trend':
            content = (
              <TrendChartCard
                widget={widget}
                data={data.trends[widget.datasetId]}
              />
            );
            break;
          case 'comparison':
            content = (
              <ComparisonChartCard
                widget={widget}
                data={data.comparisons[widget.datasetId]}
              />
            );
            break;
          case 'bullet-list':
            content = (
              <BulletListCard
                widget={widget}
                data={data.bulletSets[widget.datasetId]}
              />
            );
            break;
          case 'activity-feed':
            content = (
              <ActivityFeedCard
                widget={widget}
                data={data.feeds[widget.datasetId]}
                query={query}
              />
            );
            break;
          case 'table':
            content = (
              <DataTableCard
                widget={widget}
                rows={data.tables[widget.datasetId]}
                query={query}
              />
            );
            break;
          case 'manifest':
            content = (
              <ManifestCard
                widget={widget}
                manifest={manifest}
                role={role}
                view={view}
              />
            );
            break;
          case 'spotlight':
            content = <SpotlightCard widget={widget} />;
            break;
        }

        return (
          <div className={spanClass(widget)} key={widget.id} style={style}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
