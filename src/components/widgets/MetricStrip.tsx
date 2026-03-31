import { useId } from 'react';
import * as d3 from 'd3';
import { MetricRecord } from '../../types';
import { formatDelta, formatMetricValue } from '../../lib/formatters';
import { WidgetFrame } from '../WidgetFrame';
import type { MetricStripWidget } from '../../types';

interface MetricStripProps {
  widget: MetricStripWidget;
  metrics: MetricRecord[];
}

function Sparkline({ values, trend }: { values: number[]; trend: string }) {
  const gradientId = useId();
  const width = 120;
  const height = 44;
  const pad = 4;

  const minVal = d3.min(values) ?? 0;
  const maxVal = d3.max(values) ?? 100;
  // Prevent collapsed domain
  const domainPad = maxVal === minVal ? 10 : 0;

  const x = d3
    .scaleLinear()
    .domain([0, values.length - 1])
    .range([pad, width - pad]);
  const y = d3
    .scaleLinear()
    .domain([minVal - domainPad, maxVal + domainPad])
    .range([height - pad, pad]);

  const lineGen = d3
    .line<number>()
    .x((_, i) => x(i))
    .y((v) => y(v))
    .curve(d3.curveMonotoneX);

  const areaGen = d3
    .area<number>()
    .x((_, i) => x(i))
    .y0(height)
    .y1((v) => y(v))
    .curve(d3.curveMonotoneX);

  const strokeColor =
    trend === 'up' ? 'var(--accent)' : trend === 'down' ? 'var(--signal)' : 'var(--muted)';

  return (
    <svg aria-hidden="true" className="metric-card__sparkline" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.16" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaGen(values) ?? ''} fill={`url(#${gradientId})`} />
      <path d={lineGen(values) ?? ''} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function MetricStrip({ widget, metrics }: MetricStripProps) {
  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
    >
      <div className="metric-strip">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.id}>
            <div className="metric-card__copy">
              <p>{metric.label}</p>
              <strong>{formatMetricValue(metric)}</strong>
              <span className={`delta delta--${metric.trend}`}>{formatDelta(metric)}</span>
            </div>
            <Sparkline values={metric.sparkline} trend={metric.trend} />
            <small>{metric.context}</small>
          </article>
        ))}
      </div>
    </WidgetFrame>
  );
}
