'use client';
import {useEffect,useState} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import type {CustomRole} from '@/modules/tenancy/domain/custom-role';
import {roleLabel} from '@/lib/display-labels';
const systemRoles=['REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER'];
export function useCustomRoles(projectId:string,revision=0){
 const [roles,setRoles]=useState<CustomRole[]>([]),[error,setError]=useState<string>();
 useEffect(()=>{let active=true;apiRequest<{roles:CustomRole[]}>(`/api/roles?projectId=${projectId}`).then(result=>{if(active){setRoles(result.roles);setError(undefined);}}).catch(e=>{if(active){setRoles([]);setError(getErrorMessage(e,'Unable to load custom roles. Reload before assigning a custom role.'));}});return()=>{active=false;};},[projectId,revision]);
 return {roles,error};
}
export function roleSelection(value:string,roles:CustomRole[]){
 const custom=roles.find(role=>role.id===value);
 return custom?{role:custom.baseRole,customRoleId:custom.id,customRoleVersion:custom.version}:{role:value};
}
export function RoleOptions({roles,templateOnly=false,requesterOnly=false}:{roles:CustomRole[];templateOnly?:boolean;requesterOnly?:boolean}){
 return <>{systemRoles.filter(key=>(!templateOnly||['REQUESTER','VIEWER'].includes(key))&&(!requesterOnly||key==='REQUESTER')).map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}{roles.filter(r=>!requesterOnly||r.baseRole==='REQUESTER').map(r=><option key={r.id} value={r.id}>{r.name} · {roleLabel(r.baseRole)} Permissions</option>)}</>;
}
