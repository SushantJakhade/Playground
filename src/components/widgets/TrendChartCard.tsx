import { useId } from 'react';
import * as d3 from 'd3';
import { TrendPoint } from '../../types';
import { WidgetFrame } from '../WidgetFrame';
import type { TrendWidget } from '../../types';

interface TrendChartCardProps {
  widget: TrendWidget;
  data: TrendPoint[];
}

export function TrendChartCard({ widget, data }: TrendChartCardProps) {
  const gradientId = useId();
  const width = 720;
  const height = 280;
  const margin = { top: 22, right: 28, bottom: 36, left: 12 };
  const x = d3
    .scalePoint()
    .domain(data.map((point) => point.label))
    .range([margin.left, width - margin.right]);
  const ceiling =
    (d3.max(
      data.flatMap((point) => [point.primary, point.benchmark, point.secondary ?? 0]),
    ) ?? 100) * 1.12;
  const y = d3
    .scaleLinear()
    .domain([0, ceiling])
    .range([height - margin.bottom, margin.top]);

  const area = d3
    .area<TrendPoint>()
    .x((point) => x(point.label) ?? 0)
    .y0(height - margin.bottom)
    .y1((point) => y(point.primary))
    .curve(d3.curveMonotoneX);

  const line = d3
    .line<TrendPoint>()
    .x((point) => x(point.label) ?? 0)
    .y((point) => y(point.primary))
    .curve(d3.curveMonotoneX);

  const benchmarkLine = d3
    .line<TrendPoint>()
    .x((point) => x(point.label) ?? 0)
    .y((point) => y(point.benchmark))
    .curve(d3.curveMonotoneX);

  const secondaryLine = d3
    .line<TrendPoint>()
    .defined((point) => typeof point.secondary === 'number')
    .x((point) => x(point.label) ?? 0)
    .y((point) => y(point.secondary ?? 0))
    .curve(d3.curveMonotoneX);

  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      summary={widget.summary}
    >
      <div className="chart-card">
        <div className="chart-legend" aria-label="Trend chart legend">
          <span>
            <i className="legend-swatch legend-swatch--primary" />
            Role signal
          </span>
          <span>
            <i className="legend-swatch legend-swatch--benchmark" />
            Benchmark
          </span>
          {data.some((point) => typeof point.secondary === 'number') ? (
            <span>
              <i className="legend-swatch legend-swatch--secondary" />
              Secondary context
            </span>
          ) : null}
        </div>
        <svg
          aria-label={`${widget.title} chart`}
          className="trend-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {y.ticks(4).map((tick) => (
            <g key={tick}>
              <line
                className="chart-gridline"
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className="chart-axis-label" x={width - margin.right + 6} y={y(tick) + 4}>
                {Math.round(tick)}
              </text>
            </g>
          ))}

          <path className="chart-area" d={area(data) ?? ''} fill={`url(#${gradientId})`} />
          <path className="chart-line chart-line--primary" d={line(data) ?? ''} />
          <path className="chart-line chart-line--benchmark" d={benchmarkLine(data) ?? ''} />
          {data.some((point) => typeof point.secondary === 'number') ? (
            <path
              className="chart-line chart-line--secondary"
              d={secondaryLine(data) ?? ''}
            />
          ) : null}

          {data.map((point) => (
            <g key={point.label}>
              <circle className="chart-dot" cx={x(point.label)} cy={y(point.primary)} r="4" />
              <text
                className="chart-axis-label"
                x={x(point.label)}
                y={height - margin.bottom + 22}
                textAnchor="middle"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </WidgetFrame>
  );
}
