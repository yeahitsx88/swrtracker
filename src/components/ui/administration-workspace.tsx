'use client';
import { createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { HeadingHelp } from './heading-help';
import './administration-workspace.css';

const ActiveArea = createContext<string | undefined>(undefined);
/** Route-backed pages share their layout so editors retain exact uncertain commands. */
export function AdministrationWorkspace({ title, description, sections, activeId, children }: {
  title: string; description: ReactNode; sections: Array<{ id: string; label: string; href?: string }>; activeId?: string; children: ReactNode;
}) {
  return <div className="administration-workspace stack">
    <header className="administration-workspace-heading">
      <HeadingHelp label={title} heading={<h1>{title}</h1>} help={description} />
      <nav className="administration-jump-links" aria-label={`${title} sections`}>
        {sections.map(section => <Link key={section.id} className="button button-secondary" aria-current={activeId===section.id?'page':undefined} href={section.href??`#${section.id}`}>{section.label}</Link>)}
      </nav>
    </header>
    <ActiveArea.Provider value={activeId}>{children}</ActiveArea.Provider>
  </div>;
}

export function AdministrationArea({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const active=useContext(ActiveArea);
  return <div id={id} hidden={!!active&&active!==id} tabIndex={-1} className={`administration-area ${className}`}>{children}</div>;
}
