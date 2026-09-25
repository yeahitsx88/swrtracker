import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOut } from './sign-out';

export function Shell({ children, projectId, signedIn = false }: {
  children: ReactNode; projectId?: string; signedIn?: boolean;
}) {
  return <>
    <header className="topbar"><Link className="brand" href="/">FSS <span>Field Survey Support</span></Link>
      <nav aria-label="Main navigation">{projectId && <Link href={`/project/${projectId}/requests`}>Requests</Link>}
        <Link href="/drafts">Drafts</Link>{signedIn ? <SignOut /> : <Link href="/login">Sign in</Link>}</nav>
    </header>
    <main className="workspace">{children}</main>
    <footer className="footer">Field Survey Support · Built for the field</footer>
  </>;
}
