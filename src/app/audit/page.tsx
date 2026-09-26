'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '../ui/api';
import { Shell } from '../ui/shell';
import { AuditPicker, type Choice } from './audit-picker';

interface Event {
  id:string;source:string;eventType:string;createdAt:string;
  projectName:string|null;ticketNumber:string|null;actorName:string|null;
  actorId:string|null;payload:Record<string,unknown>;
}
interface Page { events:Event[];hasMore:boolean }
export default function AuditPage(){
  const [project,setProject]=useState<Choice|null>(null),[actor,setActor]=useState<Choice|null>(null),[event,setEvent]=useState<Choice|null>(null);
  const [from,setFrom]=useState(''),[until,setUntil]=useState('');
  const [filters,setFilters]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  const [page,setPage]=useState<Page|null>(null),[error,setError]=useState(''),[authNeeded,setAuthNeeded]=useState(false);
  const [allowed,setAllowed]=useState(false),[loading,setLoading]=useState(true),[formError,setFormError]=useState('');
  const [denied,setDenied]=useState(false);
  const [downloading,setDownloading]=useState(false),[downloadError,setDownloadError]=useState('');
  useEffect(()=>{
    let current=true;setLoading(true);setError('');setPage(null);
    api<Page>(`/api/audit?${filters}&limit=20&offset=${offset}`).then(result=>{
      if(current){setPage(result);setAllowed(true);setAuthNeeded(false);setDenied(false);}
    }).catch(cause=>{if(current){
      const forbidden=cause instanceof ApiError && cause.status===403;
      setError(forbidden ? 'Tenant administrator access is required to view this audit log.' : errorMessage(cause));
      setDenied(forbidden);setAllowed(false);setAuthNeeded(cause instanceof ApiError && cause.status===401);
    }})
      .finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[filters,offset,revision]);
  function apply(){
    setFormError('');setDownloadError('');
    if(from && until && new Date(from)>=new Date(until)){setFormError('Start must be earlier than end.');return;}
    const query=new URLSearchParams();
    if(project)query.set('projectId',project.value);if(actor)query.set('actorId',actor.value);if(event)query.set('eventType',event.value);
    if(from)query.set('from',new Date(from).toISOString());if(until)query.set('until',new Date(until).toISOString());
    setFilters(query.toString());setOffset(0);setRevision(n=>n+1);
  }
  async function download(){
    setDownloading(true);setDownloadError('');
    try{
      const response=await fetch(`/api/audit?${filters}&format=csv`,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok){const body=await response.json();throw new Error(body.error?.message ?? 'Export failed.');}
      const blob=await response.blob();const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download='audit-log.csv';document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(cause){setDownloadError(errorMessage(cause));}finally{setDownloading(false);}
  }
  return <Shell signedIn={allowed || denied}>
    <p className="eyebrow">Tenant administration</p><h1>Audit log</h1>
    <p>Review activity across your organization, including archived projects. Payloads contain the full recorded event details.</p>
    {error && <div className="notice error" role="alert">{error}{authNeeded && <p><Link href="/login?next=%2Faudit">Sign in to view the audit log</Link></p>}</div>}
    {allowed && <>
      <form className="panel" onSubmit={e=>{e.preventDefault();apply();}}>
        <h2>Filter activity</h2>
        <AuditPicker kind="projects" label="Project" value={project} onChange={setProject}/>
        <AuditPicker kind="actors" label="Actor" value={actor} onChange={setActor}/>
        <AuditPicker kind="events" label="Event type" value={event} onChange={setEvent}/>
        <div className="grid" style={{marginTop:24}}>
          <label className="field">Start (inclusive)<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label>
          <label className="field">End (exclusive)<input type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)}/></label>
        </div><p className="muted">Dates use your device’s local time. Apply changes before downloading.</p>
        {formError && <p role="alert">{formError}</p>}
        <div className="actions"><button disabled={loading}>Apply filters</button>
          <button type="button" className="secondary" disabled={loading} onClick={()=>{setProject(null);setActor(null);setEvent(null);setFrom('');setUntil('');setFilters('');setOffset(0);setFormError('');setRevision(n=>n+1);}}>Reset filters</button></div>
      </form>
      <div className="actions"><button className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh activity</button>
        <button disabled={loading || downloading} onClick={()=>void download()}>{downloading ? 'Preparing download…' : 'Download filtered CSV'}</button></div>
      {downloadError && <p className="notice error" role="alert">{downloadError}</p>}
    </>}
    {loading && <p role="status">Loading audit activity…</p>}
    {page && <section className="panel" aria-label="Audit events">
      {!page.events.length && <p>No events match the applied filters.</p>}
      {page.events.map(item=><article className="record" key={`${item.source}:${item.id}`}>
        <h2>{item.eventType}</h2><p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></p>
        <p>{item.projectName ?? 'Tenant activity / project unavailable'}{item.ticketNumber && ` · ${item.ticketNumber}`}</p>
        <p>Actor: {item.actorName ?? (item.actorId ? 'Historical actor unavailable' : 'System')}</p>
        <details><summary>Event details</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(item.payload,null,2)}</pre></details>
      </article>)}
      <div className="actions"><button className="secondary" disabled={offset===0} onClick={()=>setOffset(offset-20)}>Previous events</button>
        <span>Page {offset/20+1}</span><button className="secondary" disabled={!page.hasMore} onClick={()=>setOffset(offset+20)}>Next events</button></div>
    </section>}
    <p><Link href="/projects">Back to projects</Link></p>
  </Shell>;
}
