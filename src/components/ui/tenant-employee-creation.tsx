'use client';
import {useEffect,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {apiClient,apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import {CommandOwner} from '@/lib/frozen-command';
import {Button,ErrorBanner} from '@/components/ui';
import {ProjectMemberWizard} from './project-member-wizard';
export function TenantEmployeeCreation({owner,onCreated}:{owner:CommandOwner;onCreated:()=>void}){
 const locked=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot)!==null;
 const [projects,setProjects]=useState<Array<{id:string;name:string;status:string}>>([]),[projectId,setProjectId]=useState(''),[companies,setCompanies]=useState<Array<{id:string;name:string;type:string}>>([]),[loading,setLoading]=useState(false),[error,setError]=useState<string>(),[open,setOpen]=useState(false),[admin,setAdmin]=useState(false);
 useEffect(()=>{let active=true;apiClient.projectAdministration().then(v=>{if(active)setProjects(v.projects.filter(p=>p.status!=='ARCHIVED'&&!p.recommissioning));}).catch(e=>{if(active)setError(getErrorMessage(e,'Unable to load administered projects.'));});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;setCompanies([]);if(!projectId)return;setLoading(true);setError(undefined);apiRequest<{companies:typeof companies}>(`/api/projects/${projectId}/companies`).then(v=>{if(active)setCompanies(v.companies);}).catch(e=>{if(active)setError(getErrorMessage(e,'Unable to load project companies.'));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[projectId]);
 return <div className="stack">{error&&<ErrorBanner message={error}/>}
 {!open?<div className="row"><Button disabled={locked} onClick={()=>{setAdmin(false);setOpen(true);}}>Create Employee</Button><Button variant="secondary" disabled={locked} onClick={()=>{setAdmin(true);setOpen(true);}}>Create Project Admin</Button></div>:<>
 <label className="field"><span className="field-label">Project for this employee</span><select className="select" value={projectId} disabled={locked} onChange={e=>setProjectId(e.target.value)}><option value="">Choose a project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name} · {p.status==='SETUP'?'Setup':'Active'}</option>)}</select></label>
 {!projects.length&&<p>Create a project before provisioning project access.</p>}
 {loading?<p role="status">Loading project companies…</p>:projectId&&<><Link className="button button-secondary" href={`/projects/${projectId}/admin/companies`}>Manage Companies for This Project</Link><ProjectMemberWizard key={projectId+String(admin)} projectId={projectId} companies={companies} owner={owner} initialAdmin={admin} onCreated={onCreated}/></>}
 <Button variant="secondary" disabled={locked} onClick={()=>setOpen(false)}>Close Employee Creation</Button>
 </>}</div>;
}
