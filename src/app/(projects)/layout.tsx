import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoutButton } from '@/components/ui';

export default function ProjectsRootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-nav">
        <div className="app-nav-inner">
          <div className="app-brand">SWRTracker</div>
          <div className="row">
            <Link className="app-link" href="/projects">Projects</Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-shell">{children}</div>
      </main>
    </>
  );
}
