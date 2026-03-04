import type { ReactNode } from 'react';
import { cn } from './cn';

interface CardProps {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, className, children }: CardProps) {
  return (
    <section className={cn('panel', className)}>
      {(title || description) && (
        <div className="stack" style={{ gap: '0.2rem' }}>
          {title ? <h2 className="panel-title">{title}</h2> : null}
          {description ? <p className="muted">{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}
