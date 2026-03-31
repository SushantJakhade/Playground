import * as d3 from 'd3';
import { ComparisonPoint } from '../../types';
import { WidgetFrame } from '../WidgetFrame';
import type { ComparisonWidget } from '../../types';

interface ComparisonChartCardProps {
  widget: ComparisonWidget;
  data: ComparisonPoint[];
}

export function ComparisonChartCard({ widget, data }: ComparisonChartCardProps) {
  if (!data || data.length === 0) {
    return (
      <WidgetFrame title={widget.title} description={widget.description} summary={widget.summary}>
        <p className="empty-message">No comparison data available.</p>
      </WidgetFrame>
    );
  }

  // Filter out empty/invalid entries
  const validData = data.filter((p) => p.label && p.label !== 'N/A');

  const width = 560;
  const barCount = Math.max(validData.length, 1);
  const rowHeight = 48;
  const height = Math.max(barCount * rowHeight + 32, 120);
  const margin = { top: 8, right: 44, bottom: 8, left: 120 };

  const maxVal = d3.max(validData, (p) => Math.max(p.value, p.target ?? 0)) ?? 100;

  const x = d3
    .scaleLinear()
    .domain([0, maxVal * 1.15])
    .range([margin.left, width - margin.right]);

  const y = d3
    .scaleBand()
    .domain(validData.map((p) => p.label))
    .range([margin.top, height - margin.bottom])
    .padding(0.3);

  const barRadius = Math.min(y.bandwidth() / 2, 8);

  return (
    <WidgetFrame title={widget.title} description={widget.description} summary={widget.summary}>
      <div className="comparison-card">
        <svg
          aria-label={`${widget.title} comparison chart`}
          className="comparison-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {validData.map((point) => {
            const yPos = y(point.label) ?? 0;
            const barHeight = y.bandwidth();
            const barWidth = Math.max(x(point.value) - margin.left, 0);

            return (
              <g key={point.label}>
                {/* Label */}
                <text
                  className="comparison-label"
                  x={margin.left - 12}
                  y={yPos + barHeight / 2 + 5}
                  textAnchor="end"
                >
                  {point.label}
                </text>

                {/* Rail (background track) */}
                <rect
                  className="comparison-rail"
                  height={barHeight}
                  rx={barRadius}
                  width={width - margin.left - margin.right}
                  x={margin.left}
                  y={yPos}
                />

                {/* Value bar */}
                <rect
                  className="comparison-bar"
                  height={barHeight}
                  rx={barRadius}
                  width={barWidth}
                  x={margin.left}
                  y={yPos}
                />

                {/* Target marker */}
                {typeof point.target === 'number' && point.target > 0 && (
                  <line
                    className="comparison-target"
                    x1={x(point.target)}
                    x2={x(point.target)}
                    y1={yPos - 3}
                    y2={yPos + barHeight + 3}
                  />
                )}

                {/* Value label */}
                <text
                  className="comparison-value"
                  x={margin.left + barWidth + 8}
                  y={yPos + barHeight / 2 + 5}
                  textAnchor="start"
                >
                  {point.value}
                </text>
              </g>
            );
          })}
        </svg>

        {validData.length > 0 && (
          <div className="comparison-notes">
            {validData.map((point) => (
              <div className="comparison-note" key={point.label}>
                <strong>{point.label}</strong>
                <p>{point.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetFrame>
  );
}
