'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from './icon';
import { HeadingHelp } from './heading-help';
import './administration-workspace.css';

const ActiveArea = createContext<string | undefined>(undefined);
type Notice={source:string;message:string;href:string;tone:'error'|'success'|'status'};
const Notices=createContext<((id:string,notice?:Notice)=>void)|undefined>(undefined);
/** Feedback remains visible while its editor is retained on a hidden sibling page. */
export function useAdministrationNotice(id:string,notice?:Notice){
 const publish=useContext(Notices);
 const source=notice?.source,message=notice?.message,href=notice?.href,tone=notice?.tone;
 useEffect(()=>{
  publish?.(id,source&&message&&href&&tone?{source,message,href,tone}:undefined);
  return()=>publish?.(id,undefined);
 },[publish,id,source,message,href,tone]);
}
/** Route-backed pages share their layout so editors retain exact uncertain commands. */
export function AdministrationWorkspace({ title, description, sections, activeId, children }: {
  title: string; description: ReactNode; sections: Array<{ id: string; label: string; href?: string; icon?: IconName }>; activeId?: string; children: ReactNode;
}) {
  const [notices,setNotices]=useState<Record<string,Notice>>({});
  const publish=useCallback((id:string,notice?:Notice)=>setNotices(current=>{const next={...current};if(notice)next[id]=notice;else delete next[id];return next;}),[]);
  return <Notices.Provider value={publish}><div className="administration-workspace stack">
    <header className="administration-workspace-heading">
      <HeadingHelp label={title} heading={<h1>{title}</h1>} help={description} />
      <nav className="administration-jump-links" aria-label={`${title} sections`}>
        {sections.map(section => <Link key={section.id} className="button button-secondary" aria-current={activeId===section.id?'page':undefined} href={section.href??`#${section.id}`}>{section.icon&&<Icon name={section.icon}/>}<span>{section.label}</span></Link>)}
      </nav>
    </header>
    {Object.entries(notices).map(([id,notice])=><div key={id} className={notice.tone==='error'?'error-banner':notice.tone==='success'?'success-banner':'administration-command-review'} role={notice.tone==='error'?'alert':'status'}><strong>{notice.source}: </strong>{notice.message} <Link className="app-link" href={notice.href}>Return to {notice.source}</Link></div>)}
    <ActiveArea.Provider value={activeId}>{children}</ActiveArea.Provider>
  </div></Notices.Provider>;
}

export function AdministrationArea({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const active=useContext(ActiveArea);
  return <div id={id} hidden={!!active&&active!==id} tabIndex={-1} className={`administration-area ${className}`}>{children}</div>;
}
