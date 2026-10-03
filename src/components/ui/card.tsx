import type { ReactNode } from 'react';
import { cn } from './cn';
import {ContextHelp} from './context-help';

interface CardProps {
  title?: string;
  description?: string;
  help?: ReactNode;
  /** Optional controls shown beside the heading (wraps below it on narrow screens). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, help, actions, className, children }: CardProps) {
  return (
    <section className={cn('panel', className)}>
      {(title || description || actions) && (
        <div className={cn('panel-header', actions ? 'has-actions' : undefined)}>
          {(title || description) && (
            <div className="panel-heading">
              {title ? <div className="heading-with-help"><h2 className="panel-title">{title}</h2>{help&&<ContextHelp label={title}>{help}</ContextHelp>}</div> : null}
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
