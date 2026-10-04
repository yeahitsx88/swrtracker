import type { ReactNode } from 'react';
import { HeadingHelp } from './heading-help';
import './administration-workspace.css';

/** Section links preserve mounted editors and their administrative command state. */
export function AdministrationWorkspace({ title, description, sections, children }: {
  title: string; description: ReactNode; sections: Array<{ id: string; label: string }>; children: ReactNode;
}) {
  return <div className="administration-workspace stack">
    <header className="administration-workspace-heading">
      <HeadingHelp label={title} heading={<h1>{title}</h1>} help={description} />
      <nav className="administration-jump-links" aria-label={`${title} sections`}>
        {sections.map(section => <a key={section.id} className="button button-secondary" href={`#${section.id}`}>{section.label}</a>)}
      </nav>
    </header>
    {children}
  </div>;
}

export function AdministrationArea({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  return <div id={id} tabIndex={-1} className={`administration-area ${className}`}>{children}</div>;
}
