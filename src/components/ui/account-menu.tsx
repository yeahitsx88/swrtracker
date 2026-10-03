'use client';
import Link from 'next/link';
import type {Appearance} from '@/modules/identity/application/appearance';
import {AppearanceTheme} from './appearance-theme';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { accountNavigation } from './account-navigation';
import { ProductBrand } from './product-brand';
import './account-menu.css';
import './popout.css';
import { ScrollToTop } from './scroll-to-top';

export function AccountShell({ children,initialAppearance }: { children: ReactNode;initialAppearance?:Appearance }) {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const [context, setContext] = useState<string>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState<string>();
  const [role,setRole]=useState<import('@/modules/identity/domain/types').ProjectRole>();
  const [accountError, setAccountError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPressed = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  useEffect(() => {
    setOpen(false);
    setContext(params.projectId ?? new URLSearchParams(window.location.search).get('projectId') ?? undefined);
  }, [pathname, params.projectId]);
  useEffect(() => {
    let active = true;
    setAccountError(undefined); setRole(undefined);
    apiClient.getMyAccount(context).then(account => { if (active) {setName(account.name);setRole(account.assignment?.role as import('@/modules/identity/domain/types').ProjectRole|undefined);} })
      .catch(cause => { if (active) setAccountError(getErrorMessage(cause, 'Unable to load your greeting. Retry your account details.')); });
    return () => { active = false; };
  }, [revision,context]);
  useEffect(() => {
    if (!open) return;
    const drawer = dialog.current;
    drawer?.showModal();
    const overflow = document.body.style.overflow;
    const paddingRight = document.body.style.paddingRight;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    if (gutter) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`;
    document.body.style.overflow = 'hidden';
    return () => { drawer?.close(); document.body.style.overflow = overflow; document.body.style.paddingRight = paddingRight; };
  }, [open]);
  async function signOut() {
    setBusy(true); setError(undefined);
    try { await apiClient.logout(); window.location.replace('/login'); }
    catch (cause) { setError(getErrorMessage(cause, 'Unable to sign out. Please try again.')); setBusy(false); }
  }
  const navigation = <>
    <div className="account-panel-heading popout-header"><h2 id="account-navigation-title" className="panel-title">Your account</h2>
      <button type="button" className="button button-secondary" onClick={close} aria-label="Close account menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button></div>
    <div className="popout-body"><nav id="account-navigation" aria-label="Account navigation">
      {accountNavigation(context,role).map(item => <Link key={item.label} href={item.href}
        aria-current={pathname === item.href.split('?')[0] && (item.label !== 'Home' || !!context) ? 'page' : undefined}
        onClick={close}>{item.label}</Link>)}
      <button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button>
      {error && <p role="alert" className="error-banner">{error}</p>}
    </nav></div>
  </>;
  return <div className="application-shell" data-mode={initialAppearance?.mode}><AppearanceTheme initial={initialAppearance}/>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-nav">
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
    <ScrollToTop />
    <div className="application-workspace"><main id="main-content" tabIndex={-1}><div className="page-shell">{children}</div></main></div>
    <dialog ref={dialog} className="account-menu-panel account-drawer popout-dialog" aria-labelledby="account-navigation-title"
      onCancel={event => { event.preventDefault(); close(); }}
      onPointerDown={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        backdropPressed.current = event.target === event.currentTarget &&
          (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
      }}
      onClick={event => {
        if (!backdropPressed.current || event.target !== event.currentTarget) return;
        backdropPressed.current = false;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}>{navigation}</dialog>
  </div>;
}
