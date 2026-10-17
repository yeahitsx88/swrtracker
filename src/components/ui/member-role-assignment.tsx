'use client';
import {useAdministrationNotice} from './administration-workspace';
import {useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {RoleOptions,roleSelection,useCustomRoles} from './role-options';
import type {CrewBuild} from '@/modules/tenancy/domain/types';
import {supportedTeamRoles} from '@/lib/team-management-view';
import {roleLabel} from '@/lib/display-labels';
export interface AssignableMember{userId:string;name:string;role:string;customRoleId?:string|null;sessionVersion:number;companyType:string}
export function MemberRoleAssignment({projectId,member,owner,onAssigned,onClose,reload,crewBuild}:{projectId:string;member:AssignableMember;owner:CommandOwner;onAssigned:()=>void;onClose:()=>void;reload:()=>Promise<boolean|undefined>;crewBuild:CrewBuild}){
 const token=`member-role:${projectId}:${member.userId}`;useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const gate=useRef(new FrozenCommand<Record<string,unknown>>());
 const [value,setValue]=useState(member.customRoleId??member.role),[consent,setConsent]=useState(false),[error,setError]=useState<string>(),[done,setDone]=useState(false),[,render]=useState(0);
 const [reloading,setReloading]=useState(false);const surveySource=['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(member.role),subcontractor=member.companyType==='SUBCONTRACTOR';
 const custom=useCustomRoles(projectId),blocked=owner.blocked(token),locked=blocked||gate.current.locked||reloading;
 async function save(){if(!consent||!owner.claim(token))return;const attempt=gate.current.begin({...roleSelection(value,custom.roles),sessionVersion:member.sessionVersion,expectedRole:member.role,confirmed:true},crypto.randomUUID());if(!attempt)return;render(n=>n+1);setError(undefined);
  try{await apiRequest(`/api/projects/${projectId}/members/${member.userId}/role`,{method:'PATCH',body:attempt.body,headers:{'Idempotency-Key':attempt.key}});gate.current.success();owner.release(token);setDone(true);onAssigned();}
  catch(e){gate.current.fail(e instanceof ApiClientError?e.status:undefined);if(!gate.current.locked)owner.release(token);setError(getErrorMessage(e,'Outcome uncertain. Retry the unchanged role assignment.'));}finally{render(n=>n+1);}
 }
 useAdministrationNotice(token,{source:'Role Assignment',href:`/projects/${projectId}/admin`,tone:error?'error':done?'success':'status',message:gate.current.pending?'Saving the reviewed decision…':gate.current.stale?'State changed. Return to this action, deliberately reload and review again.':gate.current.command?'Outcome uncertain. Return to this action and retry the unchanged decision.':error??(done?'Role assigned. The member must sign in again.':undefined)??''});
 return <section className="administration-command-review stack" aria-label="Assign Project Role"><h3 className="panel-title">Assign Role for {member.name}</h3>
 {(error??custom.error)&&<ErrorBanner message={(error??custom.error)!}/>}
 {done?<SuccessBanner message="Project role assigned. This member must sign in again."/>:<>
 <label className="field"><span className="field-label">Project role</span><select aria-label="Project role" className="select" size={4} value={value} disabled={locked} onChange={e=>{setValue(e.target.value);setConsent(false);}}>{member.role==='SURVEY_MANAGER'?<option value="SURVEY_MANAGER" disabled>Survey Manager — appoint a replacement before removal</option>:null}<RoleOptions roles={surveySource?[]:custom.roles} templateOnly requesterOnly={subcontractor||surveySource}/>{!subcontractor?supportedTeamRoles(crewBuild).map(role=><option key={role} value={role}>{roleLabel(role)}</option>):null}</select></label>
 <p style={{maxWidth:'min(75ch, 760px)'}}>Changing this operational role changes this person’s future project permissions. Resolve active work, team leadership, crew/reporting links and Area responsibilities first. Request and assignment history stay unchanged.</p>
 <dl><dt>Current Permissions</dt><dd>{roleLabel(member.role)}</dd><dt>Reviewed Role</dt><dd>{custom.roles.find(r=>r.id===value)?.name??roleLabel(value)}</dd><dt>Scope</dt><dd>This project only. Independent Project Admin authority is unchanged.</dd></dl>
 <label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this role assignment and sign-in renewal.</span></label>
 <Button disabled={blocked||!consent||gate.current.pending||gate.current.stale||reloading||!!custom.error||value===member.role} onClick={()=>void save()}>{gate.current.pending?'Assigning…':gate.current.command?'Retry Unchanged Assignment':'Assign Role'}</Button>
 {gate.current.stale&&<p role="alert">Member access or the role changed. Reload project administration and review the assignment again.</p>}
 </>}
 <Button variant="secondary" disabled={blocked||gate.current.pending||reloading||!!gate.current.command&&!gate.current.stale} onClick={()=>{if(gate.current.stale){setReloading(true);void reload().then(ok=>{if(ok&&gate.current.reload()){owner.release(token);onClose();}else if(!ok)setError('Unable to reload current administration. Keep this review open and try again.');}).finally(()=>setReloading(false));}else if(gate.current.reload()){owner.release(token);onClose();}}}>{gate.current.stale?'Reload Administration':'Close Role Assignment'}</Button>
 </section>;
}
