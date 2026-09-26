'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '../ui/api';
import { Shell } from '../ui/shell';
import styles from './tenant-health.module.css';

interface HealthProject {
  id:string;name:string;status:'SETUP'|'ACTIVE'|'ARCHIVED';crewBuild:'FULL'|'MEDIUM'|'SLIM';
  createdAt:string;activatedAt:string|null;
  tickets:{created:number;submitted:number;approved:number;assignedInProgress:number;pendingApproval:number;delayed:number;canceled:number}|null;
  stale:{submitted:number;approved:number;pendingApproval:number}|null;activeHelpFlags:number|null;
  continuity:{
    activeGrants:Array<{grantId:string;userName:string|null;ageHours:number;confirmed:boolean;confirmationOverdue:boolean}>;
    crewVacancies:Array<{eventId:string;role:'PARTY_CHIEF'|'INSTRUMENT_MAN';userName:string|null;ageHours:number;openTicketCount:number;uncoveredCrewCount:number;escalationDue:boolean}>;
  }|null;
}
interface HealthPage {projects:HealthProject[];hasMore:boolean;asOf:string}
const statusNames={SETUP:'Being set up',ACTIVE:'Active',ARCHIVED:'Archived'};
const buildNames={FULL:'Full crew',MEDIUM:'Medium crew',SLIM:'Slim crew'};

export default function TenantHealthPage(){
  const [page,setPage]=useState<HealthPage|null>(null),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[authNeeded,setAuthNeeded]=useState(false),[signedIn,setSignedIn]=useState(false);
  useEffect(()=>{
    let current=true;setLoading(true);setPage(null);setError('');
    api<HealthPage>(`/api/tenant-health?limit=10&offset=${offset}`).then(result=>{
      if(current){setPage(result);setSignedIn(true);setAuthNeeded(false);}
    }).catch(cause=>{if(current){
      const denied=cause instanceof ApiError && cause.status===403;
      const unauthenticated=cause instanceof ApiError && cause.status===401;
      setError(denied ? 'Tenant administrator access is required to view project health.' : errorMessage(cause));
      setAuthNeeded(unauthenticated);if(unauthenticated)setSignedIn(false);else if(denied)setSignedIn(true);
    }}).finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[offset,revision]);
  return <Shell signedIn={signedIn}>
    <p className="eyebrow">Tenant administration</p><h1>Project health</h1>
    <p>A read-only overview of workload and staffing across your projects.</p>
    {error && <div className="notice error" role="alert">{error}{authNeeded && <p><Link href="/login?next=%2Ftenant-health">Sign in to view project health</Link></p>}</div>}
    <button className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh project health</button>
    {loading && <p role="status">Loading project health…</p>}
    {page && <>
      <p className="muted">Updated {new Date(page.asOf).toLocaleString()}</p>
      <p><Link href="/audit">Open tenant audit log</Link></p>
      {!page.projects.length && <section className="panel"><h2>No projects found</h2><p>There are no projects to display in this organization.</p></section>}
      {page.projects.map(project=><section className="panel" key={project.id} aria-label={project.name}>
        <span className="pill">{statusNames[project.status]} · {buildNames[project.crewBuild]}</span>
        <h2>{project.name}</h2>
        <p className="muted">{project.status==='SETUP' ? `Created ${new Date(project.createdAt).toLocaleDateString()}` : project.activatedAt ? `Activated ${new Date(project.activatedAt).toLocaleDateString()}` : 'Activation date not recorded'}</p>
        {project.tickets && project.stale && <>
          <dl className={styles.metrics}>
            <div><dt>Direct requests awaiting assignment</dt><dd>{project.tickets.created}</dd></div>
            <div><dt>Pending review</dt><dd>{project.tickets.submitted}</dd></div>
            <div><dt>Approved · awaiting assignment</dt><dd>{project.tickets.approved}</dd></div>
            <div><dt>Scheduled / in progress</dt><dd>{project.tickets.assignedInProgress}</dd></div>
            <div><dt>Under survey lead review</dt><dd>{project.tickets.pendingApproval}</dd></div>
            <div><dt>Delayed</dt><dd>{project.tickets.delayed}</dd></div>
            <div><dt>Canceled · all paths</dt><dd>{project.tickets.canceled}</dd></div>
            <div><dt>Active Level 2 help flags</dt><dd>{project.activeHelpFlags}</dd></div>
          </dl>
          {(project.stale.submitted>0 || project.stale.approved>0 || project.stale.pendingApproval>0) ? <div className="notice warning">
            <h3>Work needs attention</h3><ul>
              {project.stale.submitted>0 && <li>{project.stale.submitted} pending review for more than 24 hours</li>}
              {project.stale.approved>0 && <li>{project.stale.approved} approved for more than 48 hours without assignment</li>}
              {project.stale.pendingApproval>0 && <li>{project.stale.pendingApproval} under survey lead review for more than 4 hours</li>}
            </ul></div> : <p className="muted">No stale-work alerts.</p>}
          {project.activeHelpFlags!==null && project.activeHelpFlags>0 && <p className="notice warning">{project.activeHelpFlags} Level 2 help flag{project.activeHelpFlags===1?' needs':'s need'} attention from the survey team.</p>}
        </>}
        {project.continuity && <div>
          <h3>Staffing and acting authority</h3>
          {!project.continuity.activeGrants.length && !project.continuity.crewVacancies.length && <p className="muted">No active acting grants or unresolved crew vacancies.</p>}
          {project.continuity.activeGrants.map(grant=><div key={grant.grantId} className={`notice${grant.confirmationOverdue?' warning':''}`}>
            <p><strong>{grant.userName ?? 'Person unavailable'}</strong> · Acting Survey Manager · {grant.ageHours} hours</p>
            <p>{grant.confirmationOverdue ? 'Confirmation overdue' : grant.confirmed ? 'Confirmed acting authority' : 'Awaiting administrator confirmation'}</p>
          </div>)}
          {project.continuity.crewVacancies.map(vacancy=><div key={`${vacancy.eventId}:${vacancy.role}`} className="notice warning">
            <p><strong>{vacancy.userName ?? 'Person unavailable'}</strong> · {vacancy.role==='PARTY_CHIEF'?'Party Chief':'Instrument Man'} vacancy · {vacancy.ageHours} hours</p>
            <p>{vacancy.openTicketCount} open requests affected · {vacancy.uncoveredCrewCount} uncovered crew assignment{vacancy.uncoveredCrewCount===1?'':'s'}</p>
            {vacancy.escalationDue && <p>Unresolved beyond the 48-hour notification window.</p>}
          </div>)}
        </div>}
        {project.status!=='ACTIVE' && <p>{project.status==='SETUP' ? 'Operational metrics begin when the project is activated.' : 'Operational alerts are not shown for archived projects. Historical requests remain available.'}</p>}
        {project.status!=='SETUP' && <Link href={`/project/${project.id}/requests`}>View project requests</Link>}
      </section>)}
      <div className="actions"><button className="secondary" disabled={offset===0} onClick={()=>setOffset(offset-10)}>Previous projects</button>
        <span>Page {offset/10+1}</span><button className="secondary" disabled={!page.hasMore} onClick={()=>setOffset(offset+10)}>Next projects</button></div>
    </>}
    <p className="actions"><Link href="/projects">Back to projects</Link></p>
  </Shell>;
}
