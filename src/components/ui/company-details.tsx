'use client';
import {useEffect,useState} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import {roleLabel} from '@/lib/display-labels';
import type {ProjectCompanyDetails} from '@/modules/tenancy/infrastructure/project-companies.reader';
import {AdministrationDialog} from './administration-dialog';
import {AdministrationRecords} from './administration-records';
import {ErrorBanner} from './feedback';

const TYPES:Record<string,string>={GC:'General contractor',SUBCONTRACTOR:'Subcontractor',OWNER_REP:'Owner representative'};
const monthLabel=(month:string)=>new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined,{month:'short',year:'numeric',timeZone:'UTC'});

/** Decision 57 / D7: read-only company details — identity, project roster and requests by month. No outcome metrics. */
export function CompanyDetails({projectId,companyId,companyName,onDismiss}:{projectId:string;companyId:string;companyName:string;onDismiss:()=>void}){
 const [details,setDetails]=useState<ProjectCompanyDetails>(),[error,setError]=useState<string>();
 useEffect(()=>{let active=true;setDetails(undefined);setError(undefined);
  apiRequest<ProjectCompanyDetails>(`/api/projects/${projectId}/companies/${companyId}`).then(value=>{if(active)setDetails(value);})
   .catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load company details. Close and try again.'));});
  return()=>{active=false;};},[projectId,companyId]);
 const peak=Math.max(1,...(details?.requestsByMonth.map(row=>row.requests)??[]));
 return <AdministrationDialog title={`Company Details: ${companyName}`} locked={false} onDismiss={onDismiss}><div className="stack">
  {error?<ErrorBanner message={error}/>:null}
  {!details&&!error?<p role="status">Loading company details…</p>:null}
  {details?<>
   <dl className="detail-grid">
    <div><dt>Company</dt><dd>{details.company.name}</dd></div>
    <div><dt>Type</dt><dd>{TYPES[details.company.type]??details.company.type}</dd></div>
    <div><dt>On this project since</dt><dd>{new Date(details.company.associatedAt).toLocaleDateString()}</dd></div>
    <div><dt>Company ID</dt><dd className="administration-company-id">{details.company.id}</dd></div>
   </dl>
   <section className="stack" aria-label="Project roster"><h3 className="panel-title">Project Roster</h3>
    {details.roster.length?<AdministrationRecords compact label="company members on this project" rows={details.roster} id={row=>row.userId} columns={[
     {key:'name',label:'Name',text:row=>row.name},
     {key:'email',label:'Email',text:row=>row.email},
     {key:'role',label:'Project role',text:row=>roleLabel(row.role)},
     {key:'access',label:'Access',text:row=>row.accountDisabled?'Account disabled':row.accessDisabled?'Project access removed':'Active'},
    ]}/>:<p className="muted">No one from this company is on this project.</p>}
   </section>
   <section className="stack" aria-label="Requests by month"><h3 className="panel-title">Requests by Month</h3>
    <p className="muted">Submitted requests from this company in the last 12 months. Counts only; no outcome measures.</p>
    {details.requestsByMonth.length?<ul className="company-months">{details.requestsByMonth.map(row=><li key={row.month}>
     <span>{monthLabel(row.month)}</span><span className="company-month-bar" aria-hidden="true"><span style={{width:`${row.requests/peak*100}%`}}/></span><strong>{row.requests.toLocaleString()}</strong>
    </li>)}</ul>:<p className="muted">No requests submitted in the last 12 months.</p>}
   </section>
  </>:null}
 </div></AdministrationDialog>;
}
