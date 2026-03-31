import { MetricRecord, RoleConfig } from '../../types';
import { formatDelta, formatMetricValue } from '../../lib/formatters';
import { WidgetFrame } from '../WidgetFrame';
import type { HeroWidget } from '../../types';

interface HeroPanelProps {
  widget: HeroWidget;
  role: RoleConfig;
  metrics: MetricRecord[];
}

export function HeroPanel({ widget, role, metrics }: HeroPanelProps) {
  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      eyebrow={widget.eyebrow}
      chrome="hero"
    >
      <div className={`hero-panel hero-panel--${widget.variant}`}>
        <div className="hero-copy">
          <p className="hero-role">{role.summary}</p>
          <div className="hero-highlights">
            {widget.highlights.map((item) => (
              <div className="hero-highlight" key={item}>
                <span className="hero-bullet" aria-hidden="true" />
                <p>{item}</p>
              </div>
            ))}
          </div>
          <div className="hero-actions" aria-label="Suggested actions">
            {widget.actionLabels.map((action) => (
              <button className="ghost-button" key={action} type="button">
                {action}
              </button>
            ))}
          </div>
        </div>

        <div className="hero-stat-grid" aria-label="Role summary metrics">
          {metrics.map((metric) => (
            <article className="hero-stat" key={metric.id}>
              <p>{metric.label}</p>
              <strong>{formatMetricValue(metric)}</strong>
              <span className={`delta delta--${metric.trend}`}>{formatDelta(metric)}</span>
              <small>{metric.context}</small>
            </article>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}
