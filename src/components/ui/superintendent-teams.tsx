'use client';
import {useEffect,useState} from 'react';
import {apiClient} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import type {SurveyTeamDetail,SurveyTeamSummary} from '@/modules/tenancy/application/survey-teams';
import type {Page,UUID} from '@/shared/types';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {PaginationControls} from '@/components/forms';
import {AssignedWorkforce} from './assigned-workforce';
import {useTeamCommand} from './team-management';

function OwnTeamEditor({projectId,team,archived,done}:{projectId:string;team:SurveyTeamDetail;archived:boolean;done:(message?:string)=>void}) {
  const [name,setName]=useState(team.name),[members,setMembers]=useState(team.members.map(person=>person.userId)),[confirmed,setConfirmed]=useState(false);
  const command=useTeamCommand();
  const changed=name.trim()!==team.name||members.length!==team.members.length||team.members.some(person=>!members.includes(person.userId));
  const input={teamId:team.id,expectedVersion:team.rowVersion,name,areaId:team.areaId,areaIds:team.areas?.map(area=>area.id),leadUserId:team.lead.userId,memberIds:members};
  return <form className="stack" onSubmit={event=>{event.preventDefault();if(!confirmed||archived||!changed)return;void command.run('own-team',input,key=>apiClient.saveSurveyTeam(projectId,input,key),()=>done('Team saved. Your Survey Manager has been notified.'));}}>
    <h3>Edit {team.name}</h3><p className="muted">Manage the people already assigned to your team. Use Crew assignments to pair Instrument Men with Chiefs. Your Survey Manager handles new members, cross-team moves, leadership and Area coverage.</p>
    <p>Areas: {(team.areas??[{id:team.areaId,name:team.areaName}]).map(area=>area.name).join(', ')}</p>
    <label className="field"><span className="field-label">Team name</span><input className="input" maxLength={80} required value={name} disabled={archived||command.locked} onChange={event=>{setName(event.target.value);setConfirmed(false);}}/></label>
    <fieldset disabled={archived||command.locked} className="stack"><legend>Team roster</legend>{team.members.map(person=><label className="tm-check" key={person.userId}><input type="checkbox" checked={members.includes(person.userId)} disabled={person.userId===team.lead.userId} onChange={event=>{setMembers(current=>event.target.checked?[...current,person.userId]:current.filter(id=>id!==person.userId));setConfirmed(false);}}/><span>{person.name}{person.userId===team.lead.userId?' · Team lead':''}</span></label>)}</fieldset>
    {!archived?<label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked} onChange={event=>setConfirmed(event.target.checked)}/><span>I have reviewed this team change.</span></label>:null}
    {command.error?<ErrorBanner message={command.error}/>:null}
    <div className="row">{!archived?<Button type="submit" disabled={command.busy||command.stale||!confirmed||!name.trim()||!changed}>{command.busy?'Saving…':command.uncertain?'Retry unchanged team change':'Save team'}</Button>:null}<Button type="button" variant="secondary" disabled={command.busy||command.uncertain} onClick={()=>{if(command.reset())done();}}>{command.error?'Reload team':'Back to my teams'}</Button></div>
  </form>;
}

export function SuperintendentTeams({projectId,archived}:{projectId:string;archived:boolean}) {
  const [tab,setTab]=useState<'teams'|'crew'>('teams'),[editingCrew,setEditingCrew]=useState(false);
  const [page,setPage]=useState<Page<SurveyTeamSummary>>(),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  const [team,setTeam]=useState<SurveyTeamDetail>(),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>();
  useEffect(()=>{let active=true;setPage(undefined);setError(undefined);apiClient.listSurveyTeams(projectId,{search:'',limit:10,offset}).then(result=>{if(active)setPage(result);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load your teams.'));});return()=>{active=false;};},[projectId,offset,revision]);
  async function edit(id:UUID){setBusy(true);setError(undefined);setSuccess(undefined);try{setTeam((await apiClient.getSurveyTeam(projectId,id)).team);}catch(cause){setError(getErrorMessage(cause,'Unable to open this team.'));}finally{setBusy(false);}}
  return <div className="stack"><nav className="row" aria-label="My team views"><Button variant="secondary" aria-pressed={tab==='teams'} disabled={!!team||busy||editingCrew} onClick={()=>setTab('teams')}>My teams</Button><Button variant="secondary" aria-pressed={tab==='crew'} disabled={!!team||busy||editingCrew} onClick={()=>setTab('crew')}>Crew assignments</Button></nav>
    {tab==='crew'?<AssignedWorkforce projectId={projectId} role="SURVEY_SUPERINTENDENT" archived={archived} onEditingChange={setEditingCrew}/>:<section className="panel stack"><h2>My teams</h2><p className="muted">Teams you lead and the Areas they cover. Team changes notify your Survey Manager.</p>
      {error?<><ErrorBanner message={error}/><Button variant="secondary" onClick={()=>setRevision(value=>value+1)}>Retry teams</Button></>:null}{success?<SuccessBanner message={success}/>:null}
      {team?<OwnTeamEditor key={team.id} projectId={projectId} team={team} archived={archived} done={message=>{setTeam(undefined);setSuccess(message);setRevision(value=>value+1);}}/>:!page?<p role="status">Loading your teams…</p>:<>{page.total===0?<p>No teams are assigned to you yet. Your Survey Manager can choose you as a team lead.</p>:null}{page.data.map(item=><div className="tm-person" key={item.id}><div><strong>{item.name}</strong><p className="muted">{item.areas?.map(area=>area.name).join(', ')??item.areaName} · {item.memberCount} members</p></div><Button variant="secondary" disabled={busy} onClick={()=>void edit(item.id)}>{archived?'View team':'Edit team'}</Button></div>)}<PaginationControls total={page.total} offset={offset} limit={10} onChange={setOffset}/></>}
    </section>}
  </div>;
}
