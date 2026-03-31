import { useId } from 'react';
import * as d3 from 'd3';
import { TrendPoint } from '../../types';
import { WidgetFrame } from '../WidgetFrame';
import type { TrendWidget } from '../../types';

interface TrendChartCardProps {
  widget: TrendWidget;
  data: TrendPoint[];
}

function formatAxisValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `${Math.round(value)}`;
}

export function TrendChartCard({ widget, data }: TrendChartCardProps) {
  const gradientId = useId();

  if (!data || data.length === 0) {
    return (
      <WidgetFrame title={widget.title} description={widget.description} summary={widget.summary}>
        <p className="empty-message">No trend data available.</p>
      </WidgetFrame>
    );
  }

  const width = 720;
  const height = 300;
  const margin = { top: 24, right: 56, bottom: 44, left: 16 };

  const x = d3
    .scalePoint()
    .domain(data.map((p) => p.label))
    .range([margin.left, width - margin.right])
    .padding(0.1);

  const allValues = data.flatMap((p) => [
    p.primary,
    p.benchmark,
    ...(typeof p.secondary === 'number' ? [p.secondary] : []),
  ]);
  const minVal = d3.min(allValues) ?? 0;
  const maxVal = d3.max(allValues) ?? 100;
  const padding = (maxVal - minVal) * 0.15 || 10;

  const y = d3
    .scaleLinear()
    .domain([Math.max(0, minVal - padding), maxVal + padding])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const area = d3
    .area<TrendPoint>()
    .x((p) => x(p.label) ?? 0)
    .y0(height - margin.bottom)
    .y1((p) => y(p.primary))
    .curve(d3.curveMonotoneX);

  const line = d3
    .line<TrendPoint>()
    .x((p) => x(p.label) ?? 0)
    .y((p) => y(p.primary))
    .curve(d3.curveMonotoneX);

  const benchmarkLine = d3
    .line<TrendPoint>()
    .x((p) => x(p.label) ?? 0)
    .y((p) => y(p.benchmark))
    .curve(d3.curveMonotoneX);

  const secondaryLine = d3
    .line<TrendPoint>()
    .defined((p) => typeof p.secondary === 'number')
    .x((p) => x(p.label) ?? 0)
    .y((p) => y(p.secondary ?? 0))
    .curve(d3.curveMonotoneX);

  const hasSecondary = data.some((p) => typeof p.secondary === 'number');
  const ticks = y.ticks(5);

  // Show every Nth label to avoid overlap
  const labelStep = data.length > 8 ? 2 : 1;

  return (
    <WidgetFrame title={widget.title} description={widget.description} summary={widget.summary}>
      <div className="chart-card">
        <div className="chart-legend" aria-label="Trend chart legend">
          <span>
            <i className="legend-swatch legend-swatch--primary" />
            Primary
          </span>
          <span>
            <i className="legend-swatch legend-swatch--benchmark" />
            Benchmark
          </span>
          {hasSecondary && (
            <span>
              <i className="legend-swatch legend-swatch--secondary" />
              Secondary
            </span>
          )}
        </div>
        <svg
          aria-label={`${widget.title} chart`}
          className="trend-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="chart-gridline"
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="chart-axis-label"
                x={width - margin.right + 8}
                y={y(tick) + 4}
                textAnchor="start"
              >
                {formatAxisValue(tick)}
              </text>
            </g>
          ))}

          {/* Base line */}
          <line
            className="chart-gridline"
            x1={margin.left}
            x2={width - margin.right}
            y1={height - margin.bottom}
            y2={height - margin.bottom}
            strokeOpacity="0.16"
          />

          {/* Area + lines */}
          <path d={area(data) ?? ''} fill={`url(#${gradientId})`} />
          <path className="chart-line chart-line--benchmark" d={benchmarkLine(data) ?? ''} />
          {hasSecondary && (
            <path className="chart-line chart-line--secondary" d={secondaryLine(data) ?? ''} />
          )}
          <path className="chart-line chart-line--primary" d={line(data) ?? ''} />

          {/* Dots + x-axis labels */}
          {data.map((point, i) => (
            <g key={point.label}>
              <circle
                className="chart-dot"
                cx={x(point.label)}
                cy={y(point.primary)}
                r="4.5"
              />
              {i % labelStep === 0 && (
                <text
                  className="chart-axis-label"
                  x={x(point.label)}
                  y={height - margin.bottom + 24}
                  textAnchor="middle"
                >
                  {point.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </WidgetFrame>
  );
}
