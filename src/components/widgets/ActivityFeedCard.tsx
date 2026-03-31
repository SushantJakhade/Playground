import { FeedItem } from '../../types';
import { WidgetFrame } from '../WidgetFrame';
import type { ActivityFeedWidget } from '../../types';

interface ActivityFeedCardProps {
  widget: ActivityFeedWidget;
  data: FeedItem[];
  query: string;
}

export function ActivityFeedCard({
  widget,
  data,
  query,
}: ActivityFeedCardProps) {
  const filtered = query
    ? data.filter((item) =>
        `${item.title} ${item.detail} ${item.category}`
          .toLowerCase()
          .includes(query),
      )
    : data;

  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      summary={widget.summary}
    >
      <div className="feed-list" role="list">
        {filtered.map((item) => (
          <article className="feed-item" key={item.id} role="listitem">
            <span className={`feed-severity feed-severity--${item.severity}`} aria-hidden="true" />
            <div>
              <div className="feed-item__topline">
                <strong>{item.title}</strong>
                <time>{item.time}</time>
              </div>
              <p>{item.detail}</p>
              <small>{item.category}</small>
            </div>
          </article>
        ))}
        {filtered.length === 0 ? <p className="empty-message">No feed items match the current search.</p> : null}
      </div>
    </WidgetFrame>
  );
}
