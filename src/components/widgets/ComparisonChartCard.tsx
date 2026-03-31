import * as d3 from 'd3';
import { ComparisonPoint } from '../../types';
import { WidgetFrame } from '../WidgetFrame';
import type { ComparisonWidget } from '../../types';

interface ComparisonChartCardProps {
  widget: ComparisonWidget;
  data: ComparisonPoint[];
}

export function ComparisonChartCard({
  widget,
  data,
}: ComparisonChartCardProps) {
  const width = 560;
  const height = 250;
  const margin = { top: 12, right: 38, bottom: 14, left: 140 };
  const x = d3
    .scaleLinear()
    .domain([0, (d3.max(data, (point) => Math.max(point.value, point.target ?? 0)) ?? 100) * 1.12])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(data.map((point) => point.label))
    .range([margin.top, height - margin.bottom])
    .padding(0.22);

  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      summary={widget.summary}
    >
      <div className="comparison-card">
        <svg
          aria-label={`${widget.title} comparison chart`}
          className="comparison-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {data.map((point) => {
            const yPos = y(point.label) ?? 0;
            const barHeight = y.bandwidth();

            return (
              <g key={point.label}>
                <text className="comparison-label" x={12} y={yPos + barHeight / 2 + 5}>
                  {point.label}
                </text>
                <rect
                  className="comparison-rail"
                  height={barHeight}
                  rx="10"
                  width={x.range()[1] - margin.left}
                  x={margin.left}
                  y={yPos}
                />
                <rect
                  className="comparison-bar"
                  height={barHeight}
                  rx="10"
                  width={x(point.value) - margin.left}
                  x={margin.left}
                  y={yPos}
                />
                {typeof point.target === 'number' ? (
                  <line
                    className="comparison-target"
                    x1={x(point.target)}
                    x2={x(point.target)}
                    y1={yPos - 4}
                    y2={yPos + barHeight + 4}
                  />
                ) : null}
                <text className="comparison-value" x={width - margin.right + 4} y={yPos + barHeight / 2 + 5}>
                  {point.value}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="comparison-notes">
          {data.map((point) => (
            <div className="comparison-note" key={point.label}>
              <strong>{point.label}</strong>
              <p>{point.note}</p>
            </div>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}
