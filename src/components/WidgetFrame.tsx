import { PropsWithChildren } from 'react';

interface WidgetFrameProps extends PropsWithChildren {
  title: string;
  description: string;
  summary?: string;
  eyebrow?: string;
  chrome?: 'default' | 'hero';
}

export function WidgetFrame({
  title,
  description,
  summary,
  eyebrow,
  chrome = 'default',
  children,
}: WidgetFrameProps) {
  return (
    <section className={`widget-frame widget-frame--${chrome}`}>
      <header className="widget-header">
        <div>
          {eyebrow ? <p className="widget-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </header>
      <div className="widget-body">{children}</div>
      {summary ? <p className="widget-summary">{summary}</p> : null}
    </section>
  );
}
