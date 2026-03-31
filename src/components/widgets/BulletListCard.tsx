import * as d3 from 'd3';
import { BulletPoint } from '../../types';
import { WidgetFrame } from '../WidgetFrame';
import type { BulletListWidget } from '../../types';

interface BulletListCardProps {
  widget: BulletListWidget;
  data: BulletPoint[];
}

export function BulletListCard({ widget, data }: BulletListCardProps) {
  if (!data || data.length === 0) {
    return (
      <WidgetFrame title={widget.title} description={widget.description} summary={widget.summary}>
        <p className="empty-message">No target data available.</p>
      </WidgetFrame>
    );
  }

  const scale = d3
    .scaleLinear()
    .domain([0, d3.max(data, (item) => item.stretch) ?? 100])
    .range([0, 100]);

  return (
    <WidgetFrame title={widget.title} description={widget.description} summary={widget.summary}>
      <div className="bullet-list">
        {data.map((item) => {
          const valuePercent = Math.min(scale(item.value), 100);
          const targetPercent = Math.min(scale(item.target), 100);
          const floorPercent = Math.min(scale(item.floor), 100);
          const stretchPercent = Math.min(scale(item.stretch), 100);

          return (
            <article className="bullet-row" key={item.label}>
              <div className="bullet-row__copy">
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.note}</p>
                </div>
                <span className="bullet-row__value">
                  {item.value}
                  <small>{item.unit}</small>
                </span>
              </div>

              <div className="bullet-track" aria-hidden="true">
                <span
                  className="bullet-range bullet-range--stretch"
                  style={{ width: `${stretchPercent}%` }}
                />
                <span
                  className="bullet-range bullet-range--floor"
                  style={{ width: `${floorPercent}%` }}
                />
                <span
                  className="bullet-value"
                  style={{ width: `${valuePercent}%` }}
                />
                <span
                  className="bullet-target"
                  style={{ left: `${targetPercent}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </WidgetFrame>
  );
}
