import * as d3 from 'd3';
import { MetricRecord } from '../../types';
import { formatDelta, formatMetricValue } from '../../lib/formatters';
import { WidgetFrame } from '../WidgetFrame';
import type { MetricStripWidget } from '../../types';

interface MetricStripProps {
  widget: MetricStripWidget;
  metrics: MetricRecord[];
}

function sparkline(values: number[]) {
  const width = 120;
  const height = 40;
  const x = d3
    .scaleLinear()
    .domain([0, values.length - 1])
    .range([0, width]);
  const y = d3
    .scaleLinear()
    .domain([d3.min(values) ?? 0, d3.max(values) ?? 100])
    .range([height, 0]);

  return d3
    .line<number>()
    .x((_, index) => x(index))
    .y((value) => y(value))
    .curve(d3.curveMonotoneX)(values);
}

export function MetricStrip({ widget, metrics }: MetricStripProps) {
  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      summary="Metrics remain plain config references so any role can reuse them without duplicating card code."
    >
      <div className="metric-strip">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.id}>
            <div className="metric-card__copy">
              <p>{metric.label}</p>
              <strong>{formatMetricValue(metric)}</strong>
              <span className={`delta delta--${metric.trend}`}>{formatDelta(metric)}</span>
            </div>
            <svg
              aria-hidden="true"
              className="metric-card__sparkline"
              viewBox="0 0 120 40"
            >
              <path d={sparkline(metric.sparkline) ?? ''} />
            </svg>
            <small>{metric.context}</small>
          </article>
        ))}
      </div>
    </WidgetFrame>
  );
}
