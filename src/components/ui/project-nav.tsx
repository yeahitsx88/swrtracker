'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectMembershipRecord } from '@/lib/contracts/projects';
import { Icon, type IconName } from './icon';
import { getProjectNavigation } from './project-navigation';

const ICONS: Record<string, IconName> = { Home: 'home', 'New Request': 'plus', Requests: 'list', Drafts: 'draft', 'All Requests': 'search', 'Crew Work': 'crew', 'Survey Operations': 'gauge', 'PC Approvals': 'check', 'Team Management': 'team', Admin: 'settings' };

export function ProjectNav({ projectId, role, canAdminister, status, projectName }: {
  projectId: string; role: ProjectRole | null; canAdminister?: boolean;
  status: ProjectMembershipRecord['status']; projectName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const backdrop = useRef(false);
  const items = getProjectNavigation(role, canAdminister, status);
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  useEffect(() => { dialog.current?.close(); setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.current?.close(); document.body.style.overflow = overflow; };
  }, [open]);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1000px)');
    const change = () => { if (wide.matches) { dialog.current?.close(); setOpen(false); } };
    wide.addEventListener('change', change);
    return () => wide.removeEventListener('change', change);
  }, []);
  const navigation = <nav aria-label="Project navigation" className="workspace-navigation">
    {(['Home', 'Work', 'People', 'Administration'] as const).map(group => {
      const groupItems = items.filter(item => item.group === group);
      return groupItems.length ? <div className="workspace-nav-group" key={group}>{group !== 'Home' && <p className="workspace-nav-label">{group}</p>}{groupItems.map(item => {
        const href = item.href(projectId);
        const active = pathname === href || (item.label !== 'Home' && pathname.startsWith(`${href}/`));
        return <Link key={item.label} href={href} aria-current={active ? 'page' : undefined} onClick={() => { if (open) close(); }}><Icon name={ICONS[item.label] ?? 'list'} /><span>{item.label === 'Admin' ? 'Project Administration' : item.label}</span></Link>;
      })}</div> : null;
    })}
    <div className="workspace-nav-account"><p className="workspace-nav-label">Account</p><Link href="/appearance" onClick={() => { if (open) close(); }}><Icon name="settings" />Appearance</Link><Link href="/projects" onClick={() => { if (open) close(); }}><Icon name="back" />Switch project</Link></div>
  </nav>;
  return <>
    <aside className="project-sidebar"><div className="workspace-sidebar-title">SWRTracker<span>Survey work requests</span></div>{navigation}</aside>
    <div className="project-mobile-navigation"><button ref={trigger} type="button" className="button button-secondary" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="list" />Project navigation</button><span>{items.find(item => item.href(projectId) === pathname)?.label ?? 'Workspace'}</span></div>
    <dialog ref={dialog} className="project-navigation-drawer" aria-labelledby="project-navigation-title" onCancel={event => { event.preventDefault(); close(); }} onPointerDown={event => { const r = event.currentTarget.getBoundingClientRect(); backdrop.current = event.target === event.currentTarget && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom); }} onClick={() => { if (backdrop.current) { backdrop.current = false; close(); } }}>
      <div className="workspace-drawer-heading"><h2 id="project-navigation-title">{projectName}</h2><button type="button" className="button button-secondary" onClick={close}>Close</button></div>{navigation}
    </dialog>
  </>;
}
