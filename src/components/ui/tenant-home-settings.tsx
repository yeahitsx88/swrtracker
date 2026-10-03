 'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import type {CommandOwner} from '@/lib/frozen-command';
import type {CustomRoleDirectory} from '@/modules/tenancy/domain/custom-role';
import type {ProjectTemplateListItem} from '@/modules/tenancy/application/ports';
import {Button,Card,ErrorBanner} from '@/components/ui';
import {HomeOrganization} from './home-organization';
import {RolesPermissions} from './roles-permissions';
import {AdministrationRecords} from './administration-records';
import {ProjectTemplateCreation} from './project-template-creation';

export function TenantHomeSettings({owner,disabled,onTemplatesChanged}:{owner:CommandOwner;disabled:boolean;onTemplatesChanged:()=>void}){
 const [section,setSection]=useState<'templates'|'roles'|'account'>('templates');
 const [templates,setTemplates]=useState<ProjectTemplateListItem[]>(),[directory,setDirectory]=useState<CustomRoleDirectory>(),[error,setError]=useState<string>(),[open,setOpen]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;Promise.all([apiRequest<{templates:ProjectTemplateListItem[]}>('/api/project-templates'),apiRequest<CustomRoleDirectory>('/api/custom-roles')]).then(([list,roles])=>{if(active){setTemplates(list.templates);setDirectory(roles);setError(undefined);}}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load tenant settings. Refresh to try again.'));});return()=>{active=false;};},[revision]);
 return <section className="stack" aria-label="Tenant General Settings"><h2>Tenant General Settings</h2><div className="row"><Link className="app-link" href="/accounts">Tenant Accounts and Central IT Reviews</Link></div><nav className="tabs admin-workspace-navigation" aria-label="Tenant settings sections">{([{id:'templates',label:'Project Templates'},{id:'roles',label:'Roles & Permissions'},{id:'account',label:'Account Organization'}] as const).map(item=><Button key={item.id} variant="secondary" aria-pressed={section===item.id} aria-controls={`tenant-${item.id}`} disabled={disabled||owner.snapshot()!==null} onClick={()=>setSection(item.id)}>{item.label}</Button>)}</nav>
 {error&&<ErrorBanner message={error}/>}
 <div id="tenant-templates" hidden={section!=='templates'}><Card title="Project Templates" help="Templates are tenant-wide starting configurations. Create them here, then choose one during new project creation. Existing projects retain their own configuration."><div className="stack"><div className="row"><Button disabled={disabled||owner.snapshot()!==null||open} onClick={()=>{if(owner.claim('template-creation'))setOpen(true);}}>Create Template</Button><Button variant="secondary" disabled={disabled||owner.snapshot()!==null||open} onClick={()=>setRevision(n=>n+1)}>Refresh Templates</Button></div>{templates?<AdministrationRecords label="project templates" disabled={disabled||owner.snapshot()!==null} rows={templates} id={t=>t.id} columns={[{key:'name',label:'Template',text:t=>t.name},{key:'crew',label:'Crew Build',text:t=>t.crewBuild==='FULL'?'Full':t.crewBuild==='MEDIUM'?'Medium':'Slim'},{key:'areas',label:'Area Levels',text:t=>String(t.aorLevelCount)},{key:'groups',label:'Discipline Groups',text:t=>String(t.disciplineGroupCount)},{key:'usage',label:'Projects Using Template',text:t=>String(t.usageCount)}]}/>:<p role="status">{error?'Templates are unavailable. Refresh to try again.':'Loading project templates…'}</p>}</div></Card></div>
 <div id="tenant-roles" hidden={section!=='roles'}><RolesPermissions directory={directory} owner={owner} disabled={disabled} onCreated={role=>setDirectory(current=>current?{...current,roles:[...current.roles,role]}:current)} onReload={()=>setRevision(n=>n+1)}/></div>
 <div id="tenant-account" hidden={section!=='account'}><Card title="Account Organization"><HomeOrganization/></Card></div>
 {open&&<ProjectTemplateCreation owner={owner} onClose={()=>setOpen(false)} onCreated={()=>{setRevision(n=>n+1);onTemplatesChanged();}}/>}
 </section>;
}
