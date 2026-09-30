'use client';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { accountNavigation } from './account-navigation';
import './account-menu.css';

export function AccountMenu() {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const [context, setContext] = useState<string>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
    setContext(params.projectId ?? new URLSearchParams(window.location.search).get('projectId') ?? undefined);
  }, [pathname, params.projectId]);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  async function signOut() {
    setBusy(true); setError(undefined);
    try { await apiClient.logout(); window.location.replace('/login'); }
    catch (cause) { setError(getErrorMessage(cause, 'Unable to sign out. Please try again.')); setBusy(false); }
  }
  return (
    <div className="account-menu" ref={root} onKeyDown={event => {
      if (event.key === 'Escape' && open) { setOpen(false); trigger.current?.focus(); }
    }} onBlur={event => {
      // Disabling Sign out can blur it without a new focus target; keep failures visible.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <button ref={trigger} type="button" className="button button-secondary account-menu-trigger"
        aria-label="Menu" aria-expanded={open} aria-controls="account-navigation" onClick={() => setOpen(!open)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg><span>Menu</span>
      </button>
      {open && <nav id="account-navigation" className="account-menu-panel" aria-label="Account navigation">
        {accountNavigation(context).map(item => <Link key={item.label} href={item.href}
          aria-current={pathname === item.href.split('?')[0] ? 'page' : undefined}
          onClick={() => setOpen(false)}>{item.label}</Link>)}
        <button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button>
        {error && <p role="alert" className="error-banner">{error}</p>}
      </nav>}
    </div>
  );
}
