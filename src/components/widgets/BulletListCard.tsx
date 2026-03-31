import * as d3 from 'd3';
import { BulletPoint } from '../../types';
import { WidgetFrame } from '../WidgetFrame';
import type { BulletListWidget } from '../../types';

interface BulletListCardProps {
  widget: BulletListWidget;
  data: BulletPoint[];
}

export function BulletListCard({ widget, data }: BulletListCardProps) {
  const scale = d3
    .scaleLinear()
    .domain([0, d3.max(data, (item) => item.stretch) ?? 100])
    .range([0, 100]);

  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      summary={widget.summary}
    >
      <div className="bullet-list">
        {data.map((item) => (
          <article className="bullet-row" key={item.label}>
            <div className="bullet-row__copy">
              <div>
                <strong>{item.label}</strong>
                <p>{item.note}</p>
              </div>
              <span>
                {item.value}
                {item.unit}
              </span>
            </div>

            <div className="bullet-track" aria-hidden="true">
              <span className="bullet-range bullet-range--stretch" style={{ width: `${scale(item.stretch)}%` }} />
              <span className="bullet-range bullet-range--floor" style={{ width: `${scale(item.floor)}%` }} />
              <span className="bullet-value" style={{ width: `${scale(item.value)}%` }} />
              <span className="bullet-target" style={{ left: `${scale(item.target)}%` }} />
            </div>
          </article>
        ))}
      </div>
    </WidgetFrame>
  );
}
