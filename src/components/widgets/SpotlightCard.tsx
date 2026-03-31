import { WidgetFrame } from '../WidgetFrame';
import type { SpotlightWidget } from '../../types';

interface SpotlightCardProps {
  widget: SpotlightWidget;
}

export function SpotlightCard({ widget }: SpotlightCardProps) {
  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
    >
      <div className="spotlight-card">
        <div className="spotlight-items">
          {widget.items.map((item) => (
            <div className="spotlight-item" key={item}>
              <span aria-hidden="true" />
              <p>{item}</p>
            </div>
          ))}
        </div>

        <div className="hero-actions">
          {widget.callsToAction.map((action) => (
            <button className="ghost-button" key={action} type="button">
              {action}
            </button>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}
