'use client';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { accountNavigation } from './account-navigation';
import { ProductBrand } from './product-brand';
import './account-menu.css';

export function AccountShell({ children }: { children: ReactNode }) {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const [context, setContext] = useState<string>();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState<string>();
  const [accountError, setAccountError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(104);
  const header = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    setOpen(false);
    setContext(params.projectId ?? new URLSearchParams(window.location.search).get('projectId') ?? undefined);
  }, [pathname, params.projectId]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    update(); media.addEventListener('change', update);
    const observer = new ResizeObserver(() => setHeaderHeight(header.current?.getBoundingClientRect().height ?? 104));
    if (header.current) observer.observe(header.current);
    return () => { media.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  useEffect(() => {
    let active = true;
    setAccountError(undefined);
    apiClient.getMyAccount().then(account => { if (active) setName(account.name); })
      .catch(cause => { if (active) setAccountError(getErrorMessage(cause, 'Unable to load your greeting. Retry your account details.')); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    if (!open) return;
    if (mobile) {
      dialog.current?.showModal();
      const overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { dialog.current?.close(); document.body.style.overflow = overflow; };
    }
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open, mobile]);
  async function signOut() {
    setBusy(true); setError(undefined);
    try { await apiClient.logout(); window.location.replace('/login'); }
    catch (cause) { setError(getErrorMessage(cause, 'Unable to sign out. Please try again.')); setBusy(false); }
  }
  const navigation = <>
    <div className="account-panel-heading"><h2 id="account-navigation-title" className="panel-title">Your account</h2>
      <button type="button" className="button button-secondary" onClick={close} aria-label="Close account menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button></div>
    <nav id="account-navigation" aria-label="Account navigation">
      {accountNavigation(context).map(item => <Link key={item.label} href={item.href}
        aria-current={pathname === item.href.split('?')[0] && (item.label !== 'Home' || !!context) ? 'page' : undefined}
        onClick={() => setOpen(false)}>{item.label}</Link>)}
      <button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button>
      {error && <p role="alert" className="error-banner">{error}</p>}
    </nav>
  </>;
  return <div className={`application-shell${open && !mobile ? ' account-column-open' : ''}`}
    style={{ '--account-header-height': `${headerHeight}px` } as CSSProperties}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-nav" ref={header}>
      <div className="app-nav-inner">
        <div className="account-identity"><ProductBrand greeting={name?.trim() ? `Hello, ${name}!` : 'Welcome!'} />
          {accountError && <div className="account-greeting-error"><span role="alert">{accountError}</span><button type="button" className="app-link" onClick={() => setRevision(revision + 1)}>Retry greeting</button></div>}
        </div>
      <button ref={trigger} type="button" className="button button-secondary account-menu-trigger"
        aria-label="Menu" aria-expanded={open} aria-controls={open ? 'account-navigation' : undefined} onClick={() => open ? close() : setOpen(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg><span>Menu</span>
      </button>
      </div>
    </header>
    <div className="application-workspace"><main id="main-content" tabIndex={-1}><div className="page-shell">{children}</div></main></div>
    {open && (mobile ? <dialog ref={dialog} className="account-menu-panel account-drawer" aria-labelledby="account-navigation-title"
      onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const rect=event.currentTarget.getBoundingClientRect(); if(event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>{navigation}</dialog>
      : <aside ref={panel} className="account-menu-panel account-column" aria-labelledby="account-navigation-title" onKeyDown={event => { if (event.key === 'Escape') close(); }}>{navigation}</aside>)}
  </div>;
}
