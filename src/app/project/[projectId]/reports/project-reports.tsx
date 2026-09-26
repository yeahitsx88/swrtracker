'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '@/app/ui/api';
import { Shell } from '@/app/ui/shell';
import type { getProjectReport } from '@/modules/reporting/application';
import type { ReportDimension, TicketStatus } from '@/modules/ticket/application';
import { statusLabel } from '@/modules/ticket/domain/status-label';
import styles from './reports.module.css';

type ReportPage=Omit<Awaited<ReturnType<typeof getProjectReport>>,'asOf'> & {asOf:string};
const dimensions:Array<{value:ReportDimension;label:string}>=[
  {value:'project',label:'Project overview'},{value:'area',label:'Requests by area'},
  {value:'craft',label:'Requests by craft'},{value:'partyChief',label:'Party Chief workload'},
  {value:'instrumentMan',label:'Instrument Man workload'},
];
const metrics=[['total','Total requests'],['open','Open'],['closed','Closed'],['completed','Completed'],
  ['canceled','Canceled'],['notApproved','Not Approved'],['workload','Assigned workload']] as const;

export function ProjectReports({projectId}:{projectId:string}) {
  const [dimension,setDimension]=useState<ReportDimension>('project'),[offset,setOffset]=useState(0);
  const [page,setPage]=useState<ReportPage|null>(null),[revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [signedIn,setSignedIn]=useState(false),[authNeeded,setAuthNeeded]=useState(false);
  useEffect(()=>{
    let current=true;setLoading(true);setPage(null);setError('');
    api<ReportPage>(`/api/projects/${projectId}/reports?dimension=${dimension}&limit=10&offset=${offset}`)
      .then(result=>{if(current){setPage(result);setSignedIn(true);setAuthNeeded(false);}})
      .catch(cause=>{if(current){
        const unauthenticated=cause instanceof ApiError && cause.status===401;
        const denied=cause instanceof ApiError && cause.status===403;
        setAuthNeeded(unauthenticated);if(unauthenticated)setSignedIn(false);else if(denied)setSignedIn(true);
        setError(denied?'You do not have access to request reports for this project.':errorMessage(cause));
      }}).finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[projectId,dimension,offset,revision]);
  return <Shell projectId={projectId} signedIn={signedIn}>
    <p className="eyebrow">Project workspace</p><h1>Operational reports</h1>
    <p>Current counts include only requests you can view. Drafts are excluded.</p>
    {error && <div className="notice error" role="alert">{error}{authNeeded && <p>
      <Link href={`/login?next=${encodeURIComponent(`/project/${projectId}/reports`)}`}>Sign in to view reports</Link>
    </p>}</div>}
    <section className="panel" aria-label="Report selection">
      <label htmlFor="report-dimension">Report</label>
      <select id="report-dimension" value={dimension} onChange={event=>{setDimension(event.target.value as ReportDimension);setOffset(0);}}>
        {dimensions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <div className="actions"><button className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh report</button></div>
    </section>
    {loading && <p role="status">Loading report…</p>}
    {page && <>
      <p className="muted">Updated {new Date(page.asOf).toLocaleString()}</p>
      <details className="panel"><summary>How to read these counts</summary>
        <p>Closed means completed or canceled. Open includes Not Approved requests, which may still be approved by an override. Not Approved is also shown separately.</p>
        <p>Assigned workload includes scheduled, in-progress, under-review, and delayed requests. Each request is counted once within its report group.</p>
        <p>Area reports use the exact area recorded on each request. Crew reports use current assignments and retain historical names. They do not measure crew capacity or hours.</p>
      </details>
      {!page.groups.length && <section className="panel"><h2>No requests to report</h2><p>No visible submitted or direct requests are available in this report.</p></section>}
      {page.groups.map(group=><section className="panel" key={group.key??'unassigned'}>
        <h2 className={styles.groupName}>{group.label??(dimension==='partyChief'?'No Party Chief assigned':dimension==='instrumentMan'?'No Instrument Man assigned':'Not recorded')}</h2>
        <dl className={styles.metrics}>{metrics.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{group.counts[key]}</dd></div>)}</dl>
        <details><summary>Request status breakdown</summary><dl className={styles.breakdown}>
          {Object.entries(group.statuses).map(([status,count])=><div key={status}><dt>{status==='REQUESTER_CANCELED'?'Canceled by requester':statusLabel(status as TicketStatus)}</dt><dd>{count}</dd></div>)}
        </dl></details>
      </section>)}
      {(offset>0||page.hasMore) && <div className="actions">
        <button className="secondary" disabled={offset===0} onClick={()=>setOffset(n=>n-10)}>Previous groups</button>
        <span>Page {offset/10+1}</span><button className="secondary" disabled={!page.hasMore} onClick={()=>setOffset(n=>n+10)}>Next groups</button>
      </div>}
    </>}
    <p className="actions"><Link href={`/project/${projectId}/requests`}>Back to requests</Link></p>
  </Shell>;
}
