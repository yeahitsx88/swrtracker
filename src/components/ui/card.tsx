import type { ReactNode } from 'react';
import { cn } from './cn';

interface CardProps {
  title?: string;
  description?: string;
  /** Optional controls shown beside the heading (wraps below it on narrow screens). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, actions, className, children }: CardProps) {
  return (
    <section className={cn('panel', className)}>
      {(title || description || actions) && (
        <div className={cn('panel-header', actions ? 'has-actions' : undefined)}>
          {(title || description) && (
            <div className="panel-heading">
              {title ? <h2 className="panel-title">{title}</h2> : null}
              {description ? <p className="muted">{description}</p> : null}
            </div>
          )}
          {actions ? <div className="toolbar-group">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
