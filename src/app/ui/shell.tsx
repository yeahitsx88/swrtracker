import Link from 'next/link';
import type { ReactNode } from 'react';

export function Shell({ children }: { children: ReactNode }) {
  return <>
    <header className="topbar"><Link className="brand" href="/">FSS <span>Field Survey Support</span></Link>
      <nav aria-label="Main navigation"><Link href="/drafts">Drafts</Link><Link href="/login">Sign in</Link></nav>
    </header>
    <main className="workspace">{children}</main>
    <footer className="footer">Field Survey Support · Built for the field</footer>
  </>;
}
