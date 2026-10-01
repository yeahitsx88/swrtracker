'use client';
import {useEffect,useState} from 'react';
import {apiClient} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import {Button,ErrorBanner} from '@/components/ui';
import {TeamManagement} from './team-management';
import {AssignedWorkforce} from './assigned-workforce';
export function TeamManagementEntry({projectId}:{projectId:string}){
 const [context,setContext]=useState<Awaited<ReturnType<typeof apiClient.workforceContext>>>(),[error,setError]=useState<string>(),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setContext(undefined);setError(undefined);apiClient.workforceContext(projectId).then(value=>{if(active)setContext(value);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Your current project role does not grant Team Management access.'));});return()=>{active=false;};},[projectId,revision]);
 if(error)return <div className="stack"><ErrorBanner message={error}/><Button variant="secondary" onClick={()=>setRevision(n=>n+1)}>Retry project access</Button></div>;
 if(!context)return <p role="status">Checking Team Management access…</p>;
 return context.role==='SURVEY_MANAGER'?<TeamManagement projectId={projectId}/>:<AssignedWorkforce projectId={projectId} role={context.role} archived={context.project.status==='ARCHIVED'}/>;
}
