'use client';
import {useRef,useState} from 'react';
import {apiClient} from '@/lib/apiClient';
import {FrozenCommand} from '@/lib/frozen-command';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import {roleLabel} from '@/lib/display-labels';
import {AdministrationDialog} from './administration-dialog';
import {Button,ErrorBanner} from '@/components/ui';
import type {TeamPersonnel,SurveyTeamDetail} from '@/modules/tenancy/application/survey-teams';
import type {CrewBuild} from '@/modules/tenancy/domain/types';
import type {OperationalRoleChangeInput} from '@/modules/tenancy/application/change-survey-role';

/** One reviewed Survey role intent; parent owns the existing staffing workspace. */
export function SurveyRoleReview({projectId,person,team,crewBuild,remove,reload,cancel,saved}:{projectId:string;person:Pick<TeamPersonnel,'userId'|'name'|'role'|'roleVersion'>;team?:SurveyTeamDetail;crewBuild?:CrewBuild;remove:boolean;reload:()=>Promise<unknown>;cancel:()=>void;saved:()=>void}){
 const gate=useRef(new FrozenCommand<Parameters<typeof apiClient.changeReviewedSurveyRole>[1]>());
 const [role,setRole]=useState<OperationalRoleChangeInput['role']>(remove?'REQUESTER':person.role==='PARTY_CHIEF'?'INSTRUMENT_MAN':'PARTY_CHIEF'),[confirmed,setConfirmed]=useState(false),[error,setError]=useState<string>(),[reloading,setReloading]=useState(false),[,render]=useState(0);
 useUnsavedProgress(gate.current.locked);
 const locked=gate.current.locked||reloading;
 async function save(){if(!confirmed||reloading)return;const attempt=gate.current.begin({userId:person.userId,expectedRole:person.role,expectedRoleVersion:person.roleVersion,role,confirmRoleChanges:true,...(team?{reviewedTeamId:team.id,expectedTeamVersion:team.rowVersion}:{})},crypto.randomUUID());if(!attempt)return;setError(undefined);render(n=>n+1);
  try{await apiClient.changeReviewedSurveyRole(projectId,attempt.body,attempt.key);gate.current.success();saved();}
  catch(cause){gate.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry the unchanged role decision.'));}
  finally{render(n=>n+1);}
 }
 async function readCurrent(){setReloading(true);setError(undefined);try{await reload();if(gate.current.reload())cancel();}catch(cause){setError(getErrorMessage(cause,'Unable to reload current personnel. Keep this review open and try again.'));}finally{setReloading(false);}}
 return <AdministrationDialog className="survey-role-dialog" title={remove?'Remove Survey Role':'Change Survey Role'} locked={locked} onDismiss={cancel}>
 <p><strong>{person.name}</strong></p>
 <dl><dt>Current Role</dt><dd>{roleLabel(person.role)}</dd><dt>Reviewed Role</dt><dd>{roleLabel(role)}</dd>{team&&<><dt>Current Team</dt><dd>{team.name}</dd><dt>Team Areas</dt><dd>{(team.areas??[{id:team.areaId,name:team.areaName}]).map(a=>a.name).join(', ')}</dd></>}</dl>
 {!remove&&<label className="field"><span className="field-label">New Survey Role</span><select className="select" value={role} disabled={locked} onChange={e=>{setRole(e.target.value as OperationalRoleChangeInput['role']);setConfirmed(false);}}>{crewBuild!=='SLIM'&&<option value="PARTY_CHIEF">Party Chief</option>}<option value="INSTRUMENT_MAN">Instrument Man</option></select></label>}
 <p style={{maxWidth:'min(75ch, 760px)'}}>{remove?team?'This confirmed action removes this person from your named team and changes their project role to Requester in one transaction.':'This removes the survey role and retains Requester membership. Resolve named-team membership first.':'This changes future project permissions within your current team. Named-team membership remains unchanged.'} Resolve active work, team leadership, crew/reporting links and individual Area responsibilities first. Account access, files and request/assignment history are retained.</p>
 <p><strong>Next:</strong> {person.name} must sign in again. {team?'Your Survey Manager receives a notification. ':''}Independent administration authority is unchanged.</p>
 {error&&<ErrorBanner message={error}/>}{gate.current.stale&&<p role="alert">The reviewed person or team changed. Reload successfully, then open a fresh review and confirm again.</p>}
 <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirm {remove?'removal to Requester':'this role change'} and sign-in renewal.</span></label>
 <div className="row"><Button type="button" variant={remove?'danger':'primary'} disabled={!confirmed||gate.current.pending||gate.current.stale||reloading||role===person.role} onClick={()=>void save()}>{gate.current.pending?'Saving…':gate.current.command?'Retry Unchanged Role Decision':remove?'Confirm Role Removal':'Confirm Role Change'}</Button><Button type="button" variant="secondary" disabled={gate.current.pending||!!gate.current.command&&!gate.current.stale||reloading} onClick={()=>{if(gate.current.stale)void readCurrent();else cancel();}}>{gate.current.stale?'Reload Current Personnel':'Keep Current Role'}</Button></div>
 </AdministrationDialog>;
}
