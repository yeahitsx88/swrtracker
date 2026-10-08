'use client';
import {HeadingHelp} from '@/components/ui/heading-help';
import {SurveySetupGuide} from './survey-setup';

import {AdministrationRecords} from './administration-records';
import {RecordCollection} from '@/components/ui/record-collection';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { CommandOwner, FrozenCommand } from '@/lib/frozen-command';
import {usePathname} from 'next/navigation';
import {useAdministrationProgress} from '@/lib/use-administration-progress';
import type { Page, UUID } from '@/shared/types';
import type { TeamArea, TeamPersonnel, TeamPerson, TeamProjectContext, SurveyTeamDetail, SurveyTeamSummary } from '@/modules/tenancy/application/survey-teams';
import type { ManagedSurveyRole } from '@/modules/tenancy/application/change-survey-role';
import type { SurveyStaffingDetail } from '@/modules/tenancy/application/read-survey-staffing';
import type { StaffingLinkKind } from '@/modules/tenancy/application/unlink-survey-staffing';
import { addTeamSelection, canEditSurveyRole, removeTeamSelection, roleLabel, supportedTeamRoles } from '@/lib/team-management-view';
import { Button, ErrorBanner, SuccessBanner } from '@/components/ui';
import { PaginationControls } from '@/components/forms';
import './team-management.css';
import { MemberKpiEntry } from './member-kpi-entry';
import { ProtectedSurveyObligations } from './protected-survey-obligations';
import {SurveyRoleReview} from './survey-role-review';
import { SuperintendentAreaObligations } from './superintendent-area-obligations';

type Mode = 'personnel' | 'teams' | 'areas';
function useEditorHeadingFocus(transition = false) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [transition]);
  return heading;
}
function useTeamPage<T extends TeamPersonnel | SurveyTeamSummary | TeamArea>(projectId: string, mode: Mode, enabled: boolean, revision = 0) {
  const [search, setSearch] = useState(''), [draft, setDraft] = useState('');
  const [limit, setLimit] = useState(10), [offset, setOffset] = useState(0);
  const [data, setData] = useState<Page<T> | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setError(null); setData(null);
    const query = { search, limit, offset };
    const request = mode === 'personnel' ? apiClient.listTeamPersonnel(projectId, query) : mode === 'areas' ? apiClient.listTeamAreas(projectId, query) : apiClient.listSurveyTeams(projectId, query);
    request.then(result => {
      if (!active) return;
      if (offset > 0 && offset >= result.total) { setOffset(Math.max(0, Math.ceil(result.total / limit) - 1) * limit); return; }
      setData(result as Page<T>);
    }).catch(err => { if (active) setError(getErrorMessage(err, 'Unable to load this page. Retry the search.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId,mode,enabled,revision,retry,search,limit,offset]);
  return { data,error,loading,draft,limit,offset,setDraft,setOffset,
    search: (event: FormEvent) => { event.preventDefault(); setSearch(draft.trim()); setOffset(0); setRetry(value => value + 1); },
    resize: (value: number) => { setLimit(value); setOffset(0); }, retry: () => setRetry(value => value + 1) };
}
type PageControls = Omit<ReturnType<typeof useTeamPage>, 'data'> & { data: { total: number } | null };
function SearchControls({ page, label, disabled = false }: { page: PageControls; label: string; disabled?: boolean }) {
  return <form className="tm-search" onSubmit={page.search}>
    <label className="field tm-search-text"><span className="field-label">{label}</span><input className="input" maxLength={120} value={page.draft} onChange={event => page.setDraft(event.target.value)} disabled={disabled} /></label>
    <label className="field"><span className="field-label">Items per page</span><select className="select" value={page.limit} disabled={disabled} onChange={event => page.resize(Number(event.target.value))}>{[10,25,50,100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    <Button type="submit" variant="secondary" disabled={disabled}>Search</Button>
  </form>;
}
function PageState({ page, empty }: { page: PageControls; empty: string }) {
  return <>{page.loading ? <p role="status" className="muted">Loading…</p> : null}{page.error ? <div className="stack"><ErrorBanner message={page.error} /><Button type="button" variant="secondary" onClick={page.retry}>Retry</Button></div> : null}
    {page.data?.total === 0 ? <p className="tm-empty">{empty}</p> : null}</>;
}
function PageFooter({ page }: { page: PageControls }) {
  return page.data && page.data.total > 0 ? <div className="tm-footer"><span className="muted" role="status">{page.data.total.toLocaleString()} results</span><PaginationControls total={page.data.total} offset={page.offset} limit={page.limit} onChange={page.setOffset} /></div> : null;
}
/** Retry the same command with the same key after an uncertain response. */
export function useTeamCommand() {
  const [busy,setBusy] = useState(false), [error,setError] = useState<string | null>(null);
  const [failure,setFailure] = useState<ApiClientError | null>(null);
  const running = useRef(false), attempt = useRef(new FrozenCommand<string>());
  const uncertain = !!attempt.current.command && !attempt.current.stale;
  const owner=useRef(new CommandOwner()).current;
  useAdministrationProgress(owner,usePathname());
  async function run(kind: string, payload: unknown, execute: (key: string) => Promise<unknown>, done: () => void) {
    if (running.current) return;
    const fingerprint = JSON.stringify([kind,payload]);
    if (attempt.current.command && attempt.current.command.body !== fingerprint) {
      setError('Retry the unchanged command to recover its recorded result.'); return;
    }
    const command = attempt.current.begin(fingerprint, crypto.randomUUID());
    if (!command) return;
    owner.claim('team-command'); running.current = true; setBusy(true); setError(null); setFailure(null);
    try { await execute(command.key); attempt.current.success(); done(); }
    catch (err) { attempt.current.fail(err instanceof ApiClientError ? err.status : undefined); setFailure(err instanceof ApiClientError ? err : null); setError(getErrorMessage(err, 'The response is uncertain. Retry the unchanged command.')); }
    finally { if(!attempt.current.locked)owner.release('team-command');running.current = false; setBusy(false); }
  }
  return { busy,error,failure,run,locked:attempt.current.locked,uncertain,stale:attempt.current.stale,reset: () => {
    if (!attempt.current.reload()) return false;
    owner.release('team-command');setError(null); setFailure(null); return true;
  } };
}
function SurveyAreas({projectId,readOnly,onLockChange}:{projectId:string;readOnly:boolean;onLockChange:(locked:boolean)=>void}) {
  const [name,setName]=useState(''),[code,setCode]=useState(''),[revision,setRevision]=useState(0),[success,setSuccess]=useState('');
  const command=useTeamCommand(),page=useTeamPage<TeamArea>(projectId,'areas',true,revision);
  const [reloading,setReloading]=useState(false),[reloadError,setReloadError]=useState<string>(),[closed,setClosed]=useState(readOnly);
  async function reloadAreas(){if(reloading||command.busy||command.uncertain)return;setReloading(true);setReloadError(undefined);try{const [current]=await Promise.all([apiClient.getTeamContext(projectId),apiClient.listTeamAreas(projectId,{search:'',limit:10,offset:0})]);if(command.reset()){setClosed(current.project.status==='ARCHIVED');setName('');setCode('');setRevision(n=>n+1);onLockChange(false);}}catch(cause){setReloadError(getErrorMessage(cause,'Unable to read current Areas. Keep this review open and try again.'));}finally{setReloading(false);}}
  return <div className="stack"><p className="muted">Create the Areas where survey work takes place. Requesters can choose them when asking for support, and teams can cover one or more Areas.</p>
    {success?<SuccessBanner message={success}/>:null}
    {!closed?<form className="stack" onSubmit={event=>{event.preventDefault();onLockChange(true);void command.run('create-area',{name,code},key=>apiClient.createSurveyArea(projectId,{name,code},key),()=>{setName('');setCode('');setSuccess('Area created. It is available to requesters and teams.');setRevision(value=>value+1);onLockChange(false);});}}>
      <label className="field"><span className="field-label">Area name</span><input className="input" required maxLength={100} value={name} disabled={command.locked||command.stale||reloading} onChange={event=>setName(event.target.value)}/></label>
      <label className="field"><span className="field-label">Area code</span><input className="input" aria-label="Area code" required maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value={code} disabled={command.locked||command.stale||reloading} onChange={event=>setCode(event.target.value)}/><span className="muted">A short reference, such as AREA-C.</span></label>
      {command.stale?<p role="alert">{reloadError?'Current Areas could not be loaded.':'The Area state changed.'} Your reviewed Area remains held. Reload Areas must successfully read current choices before another decision.</p>:null}
      {reloadError?<ErrorBanner message={reloadError}/>:command.error?<ErrorBanner message={command.error}/>:null}
      <div className="row"><Button type="submit" disabled={command.busy||command.stale||reloading||!name.trim()||!code.trim()}>{command.busy?'Creating…':command.uncertain?'Retry unchanged Area':'Create Area'}</Button>{command.error&&!command.uncertain?<Button type="button" variant="secondary" disabled={reloading} onClick={()=>void reloadAreas()}>{reloading?'Reloading…':'Reload Areas'}</Button>:null}</div>
    </form>:null}
    <SearchControls page={page} label="Search Areas" disabled={command.locked}/><PageState page={page} empty="No Areas yet. Create an Area to get started."/>
    <RecordCollection label="project Areas" records={<>{page.data?.data.map(area=><li key={area.id}>{area.name}</li>)}</>}/><PageFooter page={page}/>
  </div>;
}
function RoleEditor({ projectId, person, project, cancel, saved, reload }: { projectId: string; person: TeamPersonnel; project: TeamProjectContext; cancel: () => void; saved: () => void;reload:()=>Promise<unknown> }) {
  const [removing,setRemoving]=useState(false),[reloading,setReloading]=useState(false),[reloadError,setReloadError]=useState<string>();
  async function reloadRole(){setReloading(true);setReloadError(undefined);try{await reload();if(command.reset())cancel();}catch(cause){setReloadError(getErrorMessage(cause,'Unable to reload current personnel. Keep this review open and try again.'));}finally{setReloading(false);}}
  const roles = supportedTeamRoles(project.crewBuild) as ManagedSurveyRole[];
  const [role,setRole] = useState<ManagedSurveyRole>(roles.includes(person.role as ManagedSurveyRole) ? person.role as ManagedSurveyRole : roles[0]!);
  const [confirmed,setConfirmed] = useState(false),command = useTeamCommand();
  const [handoverLocked,setHandoverLocked]=useState(false),[areaLocked,setAreaLocked]=useState(false),[roleLocked,setRoleLocked]=useState(false),[roleUncertain,setRoleUncertain]=useState(false);
  const [handoverRevision,setHandoverRevision]=useState(0),[areaRevision,setAreaRevision]=useState(0);
  const roleLock=useRef(false),handoverLock=useRef(false),areaLock=useRef(false),roleRunning=useRef(false);
  const frozenRole=useRef<Parameters<typeof apiClient.changeSurveyRole>[1]|null>(null);
  const onHandoverLock=useCallback((locked:boolean)=>{handoverLock.current=locked;setHandoverLocked(locked);},[]);
  const onAreaLock=useCallback((locked:boolean)=>{areaLock.current=locked;setAreaLocked(locked);},[]);
  const readOnly=project.status==='ARCHIVED',frozen=roleLocked||handoverLocked||areaLocked||removing||reloading||command.stale;
  const editorHeading = useEditorHeadingFocus();
  function submit(event: FormEvent) {
    event.preventDefault();
    if(readOnly||removing||reloading||command.stale||roleRunning.current||handoverLock.current||areaLock.current||(roleLock.current&&!roleUncertain)||(!roleUncertain&&(!confirmed||role===person.role)))return;
    const input=roleUncertain?frozenRole.current:{userId:person.userId,expectedRole:person.role,expectedRoleVersion:person.roleVersion,role,confirmRoleChanges:confirmed};
    if(!input)return;frozenRole.current=input;roleRunning.current=true;roleLock.current=true;setRoleLocked(true);
    void command.run('role',input,async key=>{
      try{return await apiClient.changeSurveyRole(projectId,input,key);}
      catch(error){const uncertain=!(error instanceof ApiClientError)||error.status>=500;setRoleUncertain(uncertain);roleLock.current=uncertain;setRoleLocked(uncertain);if(!uncertain)frozenRole.current=null;throw error;}
      finally{roleRunning.current=false;}
    },()=>{roleLock.current=false;setRoleLocked(false);setRoleUncertain(false);frozenRole.current=null;saved();});
  }
  const childResolved=(sibling:'area'|'handover')=>{command.reset();setConfirmed(false);if(sibling==='area')setAreaRevision(n=>n+1);else setHandoverRevision(n=>n+1);};
  return <div className="stack"><form className="tm-editor stack" onSubmit={submit} aria-label={`Change role for ${person.name}`}>
    <div><h3 className="panel-title" tabIndex={-1} ref={editorHeading}>Change Project Role</h3><p className="muted">{person.name} · {person.email}</p></div>
    <p>Current role: <strong>{roleLabel(person.role)}</strong></p>
    <label className="field"><span className="field-label">New role</span><select className="select" value={role} disabled={frozen||readOnly} onChange={event=>{if(roleLock.current||handoverLock.current||areaLock.current)return;setRole(event.target.value as ManagedSurveyRole);setConfirmed(false);}}>{roles.map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
    <p className="muted">Choose a role within the survey department. Resolve this person’s crew assignments and Area responsibilities before changing their role. Previous request history is kept.</p>
    <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={frozen||readOnly} onChange={event=>{if(!roleLock.current&&!handoverLock.current&&!areaLock.current)setConfirmed(event.target.checked);}}/><span>I confirm this role change and understand this person must sign in again.</span></label>
    {(command.error??reloadError)?<ErrorBanner message={(command.error??reloadError)!}/>:null}{roleUncertain?<p role="status">The role-change response is uncertain. Retry this unchanged confirmation to recover its recorded result.</p>:null}
    <div className="row"><Button type="submit" disabled={command.busy||command.stale||handoverLocked||areaLocked||readOnly||removing||reloading||(!roleUncertain&&(!confirmed||role===person.role))}>{command.busy?'Saving…':roleUncertain?'Retry unchanged role change':'Save role'}</Button><Button type="button" variant="secondary" disabled={roleLocked||handoverLocked||areaLocked||removing||reloading||command.busy} onClick={()=>{if(command.stale)void reloadRole();else cancel();}}>{command.error?'Reload personnel':'Cancel'}</Button>{!readOnly&&<Button type="button" variant="secondary" disabled={frozen||command.busy} onClick={()=>setRemoving(true)}>Review Role Removal</Button>}</div>
  </form>{removing&&<SurveyRoleReview projectId={projectId} person={person} remove reload={reload} cancel={cancel} saved={saved}/>}<ProtectedSurveyObligations projectId={projectId} userId={person.userId} disabled={roleLocked||areaLocked||removing||reloading||command.stale} isBlocked={()=>roleLock.current||areaLock.current||removing||reloading||command.stale} invalidateVersion={handoverRevision} onLockChange={onHandoverLock} onResolved={()=>childResolved('area')}/>{person.role==='SURVEY_SUPERINTENDENT'?<SuperintendentAreaObligations projectId={projectId} superintendentId={person.userId} disabled={roleLocked||handoverLocked||removing||reloading||command.stale} isBlocked={()=>roleLock.current||handoverLock.current||removing||reloading||command.stale} invalidateVersion={areaRevision} onLockChange={onAreaLock} onUnlinked={()=>childResolved('handover')}/>:null}</div>;
}
function TeamEditor({ projectId, project, initial, cancel, saved, reload }: { projectId: string; project: TeamProjectContext; initial: SurveyTeamDetail | null; cancel: () => void; saved: (outcome: 'saved' | 'deleted') => void;reload:()=>Promise<unknown> }) {
  const [name,setName] = useState(initial?.name ?? ''), [selectedAreas,setSelectedAreas] = useState<TeamArea[]>(initial ? initial.areas ?? [{ id: initial.areaId, name: initial.areaName }] : []);
  const [addSelection,setAddSelection]=useState<string[]>([]),[removeSelection,setRemoveSelection]=useState<string[]>([]);
  const [selected,setSelected] = useState<TeamPerson[]>(initial?.members ?? []), [lead,setLead] = useState(initial?.lead.userId ?? '');
  const [deleting,setDeleting] = useState(false), [confirmed,setConfirmed] = useState(false);
  const [areaPickerOpen,setAreaPickerOpen] = useState(!initial);
  const people = useTeamPage<TeamPersonnel>(projectId,'personnel',!deleting);
  const areas = useTeamPage<TeamArea>(projectId,'areas',!deleting && areaPickerOpen);
  useEffect(()=>{setAddSelection([]);},[people.data]);
  const command = useTeamCommand();
  const [reloading,setReloading]=useState(false),[reloadError,setReloadError]=useState<string>();
  async function back(){if(command.busy||command.uncertain||reloading)return;if(!command.stale){cancel();return;}setReloading(true);setReloadError(undefined);try{await reload();if(command.reset())cancel();}catch(cause){setReloadError(getErrorMessage(cause,'Unable to reload current teams. Keep this review open and try again.'));}finally{setReloading(false);}}
  const recoveryNotice=command.stale?<p role="alert">{reloadError?'Current teams could not be loaded.':'The team changed.'} Your reviewed team decision remains held. Reload teams must successfully read current choices before another decision.</p>:null;
  const editorHeading = useEditorHeadingFocus(deleting);
  const validRoles = supportedTeamRoles(project.crewBuild);
  const validSelection = selected.length > 0 && selected.every(person => person.active && validRoles.includes(person.role)) && selected.some(person => person.userId === lead);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedAreas.length) return;
    const input = { teamId: initial?.id ?? null, expectedVersion: initial?.rowVersion ?? null, name: name.trim(), areaId: selectedAreas[0]!.id, areaIds: selectedAreas.map(area => area.id), leadUserId: lead as UUID, memberIds: selected.map(person => person.userId) };
    void command.run('save',input,key => apiClient.saveSurveyTeam(projectId,input,key),()=>saved('saved'));
  }
  if (deleting && initial) return <form className="tm-editor stack" onSubmit={event => { event.preventDefault(); void command.run('delete',{ id: initial.id, version: initial.rowVersion },key => apiClient.deleteSurveyTeam(projectId,initial.id,initial.rowVersion,key),()=>saved('deleted')); }}>
    <h3 className="panel-title" tabIndex={-1} ref={editorHeading}>Delete {initial.name}?</h3><p>Its {initial.memberCount} members become available for another named team. Accounts, roles, reporting links and request history remain unchanged. The team record is retained in history.</p>
    <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked} onChange={event => setConfirmed(event.target.checked)} /><span>I confirm deletion of this team.</span></label>{recoveryNotice}{reloadError||command.error ? <ErrorBanner message={reloadError??command.error!} /> : null}
    <div className="row"><Button type="submit" variant="danger" disabled={!confirmed || command.busy || command.stale || reloading}>{command.busy ? 'Deleting…' : command.uncertain?'Retry unchanged deletion':'Delete team'}</Button><Button type="button" variant="secondary" disabled={command.locked || reloading} onClick={() => {if(!command.stale)setDeleting(false);}}>Keep team</Button><Button type="button" variant="secondary" disabled={command.busy || command.uncertain || reloading} onClick={()=>void back()}>Reload teams</Button></div>
  </form>;
  return <div className="tm-editor stack">
    <div className="tm-heading"><h3 className="panel-title" tabIndex={-1} ref={editorHeading}>{initial ? `Edit ${initial.name}` : 'Create Team'}</h3><Button type="button" variant="secondary" disabled={command.busy || command.uncertain || reloading} onClick={()=>void back()}>Back to teams</Button></div>
    <p className="muted">Choose a lead, surveyors and the Areas they cover. Members can see requests for those Areas. Assign Instrument Men to Party Chiefs separately when arranging the crew.</p>
    <form id="tm-save-team" onSubmit={submit} className="tm-basics">
      <label className="field"><span className="field-label">Team name</span><input className="input" required maxLength={80} value={name} disabled={command.locked} onChange={event => setName(event.target.value)} /></label>
      <label className="field"><span className="field-label">Team lead — selected member</span><select className="select" required value={lead} disabled={command.locked} onChange={event => setLead(event.target.value)}><option value="">Choose a lead</option>{selected.map(person => <option key={person.userId} value={person.userId} disabled={!person.active || !validRoles.includes(person.role)}>{person.name} · {roleLabel(person.role)}</option>)}</select></label>
    </form>
    <section className="tm-section"><h4>Areas covered</h4><p className="muted">Choose every Area this team covers. Other teams can cover the same Areas.</p><div className="row">{selectedAreas.map(area => <Button key={area.id} type="button" variant="secondary" disabled={command.locked} aria-label={`Remove ${area.name} from team coverage`} onClick={()=>setSelectedAreas(current=>current.filter(item=>item.id!==area.id))}>{area.name} · Remove</Button>)}</div>
      <details className="tm-area-picker" open={areaPickerOpen} onToggle={event => setAreaPickerOpen(event.currentTarget.open)}><summary>{selectedAreas.length ? 'Add or remove Areas' : 'Select Areas'}</summary><div className="stack"><SearchControls page={areas} label="Search active Areas" disabled={command.locked} /><PageState page={areas} empty="No active Areas match. Try another search; IT manages Area setup." />
      <div className="tm-area-options"><RecordCollection label="active Areas" records={<>{areas.data?.data.map(item => <Button key={item.id} type="button" variant="secondary" aria-pressed={selectedAreas.some(area=>area.id===item.id)} disabled={command.locked || (selectedAreas.length>=100&&!selectedAreas.some(area=>area.id===item.id))} onClick={() => setSelectedAreas(current=>current.some(area=>area.id===item.id)?current.filter(area=>area.id!==item.id):[...current,item])}>{item.name}</Button>)}</>}/></div><PageFooter page={areas} /></div></details>
    </section>
    <section className="tm-section"><HeadingHelp label={"Selected Members (/100)"} heading={<h4>Selected Members ({selected.length}/100)</h4>} help={<span>Selections stay here as you search. Choose another lead before removing the current lead.</span>}/>
      {selected.length === 0 ? <p className="tm-empty">Select survey personnel below, then choose a lead.</p> : <AdministrationRecords label="selected team members" rows={selected} id={p=>p.userId} columns={[{key:'name',label:'Name',text:p=>p.name},{key:'email',label:'Email',text:p=>p.email},{key:'role',label:'Role',text:p=>roleLabel(p.role)+(p.userId===lead?' · Team lead':'')}]} selected={removeSelection} onSelection={setRemoveSelection} disabled={command.locked} eligible={p=>p.userId!==lead} selectionActions={<Button variant="secondary" disabled={command.locked||!removeSelection.length} onClick={()=>{setSelected(current=>removeSelection.reduce((all,id)=>removeTeamSelection(all,id as UUID,lead),current));setRemoveSelection([]);}}>Remove selected from this team draft</Button>} actions={p=><Button type="button" variant="secondary" disabled={command.locked||p.userId===lead} onClick={()=>setSelected(removeTeamSelection(selected,p.userId,lead))}>Remove</Button>}/>}

    </section>
    <section className="tm-section"><h4>Add Survey Personnel</h4><SearchControls page={people} label="Search name, email or role" disabled={command.locked} /><PageState page={people} empty="No personnel match. Try another search; IT manages project membership." />
      <AdministrationRecords label="eligible survey personnel on this page" rows={people.data?.data??[]} id={p=>p.userId} columns={[{key:'name',label:'Name',text:p=>p.name},{key:'email',label:'Email',text:p=>p.email},{key:'role',label:'Role',text:p=>roleLabel(p.role)},{key:'team',label:'Team',text:p=>p.teamName??'Available'}]} selected={addSelection} onSelection={setAddSelection} disabled={command.locked} eligible={p=>p.active&&validRoles.includes(p.role)&&!selected.some(m=>m.userId===p.userId)&&(p.teamId===null||p.teamId===initial?.id)} selectionActions={<Button variant="secondary" disabled={command.locked||!addSelection.length||selected.length+addSelection.length>100} onClick={()=>{setSelected(current=>(people.data?.data??[]).filter(p=>addSelection.includes(p.userId)).reduce((all,p)=>addTeamSelection(all,p),current));setAddSelection([]);}}>Add selected to this team draft</Button>} actions={p=><Button type="button" variant="secondary" disabled={command.locked||selected.some(m=>m.userId===p.userId)||!p.active||!validRoles.includes(p.role)||p.teamId!==null&&p.teamId!==initial?.id||selected.length>=100} onClick={()=>setSelected(addTeamSelection(selected,p))}>Add</Button>}/>
<PageFooter page={people} />
    </section>
    {recoveryNotice}{reloadError||command.error ? <ErrorBanner message={reloadError??command.error!} /> : null}<div className="tm-footer"><div className="row"><Button form="tm-save-team" type="submit" disabled={command.busy || command.stale || reloading || !name.trim() || !selectedAreas.length || !validSelection}>{command.busy ? 'Saving…' : command.uncertain?'Retry unchanged team':initial ? 'Save team' : 'Create team'}</Button><Button type="button" variant="secondary" disabled={command.busy || command.uncertain || reloading} onClick={()=>void back()}>{command.error ? 'Reload teams' : 'Cancel'}</Button></div>{initial ? <Button type="button" variant="danger" disabled={command.locked} onClick={() => setDeleting(true)}>Delete team…</Button> : null}</div>
  </div>;
}

function ClosedTeamDetail({ team, back }: { team: SurveyTeamDetail; back: () => void }) {
  const editorHeading = useEditorHeadingFocus();
  return <div className="stack"><div className="tm-heading"><h3 className="panel-title" tabIndex={-1} ref={editorHeading}>{team.name}</h3><Button type="button" variant="secondary" onClick={back}>Back to teams</Button></div>
    <p className="muted">Closed project — read only · {(team.areas ?? [{id:team.areaId,name:team.areaName}]).map(area=>area.name).join(', ')} · Lead: {team.lead.name}</p>
    <RecordCollection label="team members" records={<>{team.members.map(member => <li className="tm-person" key={member.userId}><div><strong>{member.name}</strong><span className="tm-email muted">{member.email}</span></div><div>{roleLabel(member.role)}<span className="tm-email muted">{member.userId === team.lead.userId ? 'Team lead' : 'Member'}{!member.active ? ' · Inactive' : ''}</span></div></li>)}</>}/>
  </div>;
}

function StaffingEditor({ projectId, person, project, cancel, saved }: { projectId: string; person: TeamPersonnel; project: TeamProjectContext; cancel: () => void; saved: () => void }) {
  const [detail,setDetail] = useState<SurveyStaffingDetail | null>(null), [baseline,setBaseline] = useState<SurveyStaffingDetail | null>(null);
  const [loading,setLoading] = useState(false), [error,setError] = useState<string | null>(null), [revision,setRevision] = useState(0);
  const [search,setSearch] = useState(''), [draft,setDraft] = useState(''), [limit,setLimit] = useState(10), [offset,setOffset] = useState(0);
  const [area,setArea] = useState<TeamArea | null>(null), [superintendent,setSuperintendent] = useState<{ userId: UUID; name: string } | null>(null);
  const [selected,setSelected] = useState<TeamPersonnel[]>([]), [confirmed,setConfirmed] = useState(false);
  const [picker,setPicker] = useState<'area' | 'superintendent' | 'instrument' | null>(null), [rosterOpen,setRosterOpen] = useState(false);
  const [unlink,setUnlink] = useState<{ kind: StaffingLinkKind; linkId: UUID; label: string } | null>(null), [unlinkConfirmed,setUnlinkConfirmed] = useState(false);
  const [unlinkSuccess,setUnlinkSuccess] = useState<string | null>(null);
  const [staleDetected,setStaleDetected] = useState(false);
  const currentHeading = useRef<HTMLHeadingElement>(null), unlinkHeading = useEditorHeadingFocus(!!unlink);
  const initialized = useRef(false), command = useTeamCommand(), editorHeading = useEditorHeadingFocus();
  const [closed,setClosed]=useState(project.status==='ARCHIVED');
  const readOnly=closed;
  const areas = useTeamPage<TeamArea>(projectId,'areas',!readOnly && picker === 'area',revision);
  const candidates = useTeamPage<TeamPersonnel>(projectId,'personnel',!readOnly && (picker === 'superintendent' || picker === 'instrument'),revision);
  useEffect(() => {
    let active = true; setLoading(true); setError(null); setDetail(null);
    apiClient.getSurveyStaffing(projectId,person.userId,{search,limit,offset}).then(({staffing}) => {
      if (!active) return;
      if (offset > 0 && offset >= staffing.instrumentMen.total) { setOffset(Math.max(0,Math.ceil(staffing.instrumentMen.total / limit) - 1) * limit); return; }
      setDetail(staffing);
      if (!initialized.current) {
        initialized.current = true; setBaseline(staffing);
        const currentArea = staffing.areas.total === 1 ? staffing.areas.data[0] : null;
        setArea(currentArea && !currentArea.retired ? currentArea : null);
        const currentSuper = staffing.reporting?.superintendent;
        setSuperintendent(currentSuper?.active && currentSuper.role === 'SURVEY_SUPERINTENDENT' ? currentSuper : null);
      }
    }).catch(err => { if (active) setError(getErrorMessage(err,'Unable to load staffing. Retry or return to personnel.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[projectId,person.userId,search,limit,offset,revision]);
  const roster: PageControls = { data: detail?.instrumentMen ?? null,error,loading,draft,limit,offset,setDraft,setOffset,
    search: event => { event.preventDefault(); setSearch(draft.trim()); setOffset(0); setRevision(value => value + 1); },
    resize: value => { setLimit(value); setOffset(0); }, retry: () => setRevision(value => value + 1) };
  const staleEvidence = command.failure?.code === 'STALE_STAFFING' || (!!baseline && !!detail && baseline.snapshotToken !== detail.snapshotToken);
  useEffect(() => { if (staleEvidence) setStaleDetected(true); },[staleEvidence]);
  const stale = command.stale || (!command.uncertain && (staleDetected || staleEvidence));
  const blockedAreas = !!baseline && (baseline.areas.truncated || baseline.areas.total > 1);
  async function reload(close=false,completed=false) {
    if((!completed&&(command.busy||command.uncertain))||loading)return;
    setLoading(true);setError(null);
    try{
      const [context,current]=await Promise.all([apiClient.getTeamContext(projectId),apiClient.getSurveyStaffing(projectId,person.userId,{search:'',limit,offset:0}),apiClient.listTeamPersonnel(projectId,{search:'',limit:10,offset:0}),apiClient.listTeamAreas(projectId,{search:'',limit:10,offset:0})]);
      if(!command.reset())return;setClosed(context.project.status==='ARCHIVED');
      if(close){cancel();return;}
      setStaleDetected(false);setUnlink(null);setUnlinkConfirmed(false);initialized.current=true;
      setBaseline(current.staffing);setDetail(current.staffing);setSelected([]);setConfirmed(false);
      const currentArea=current.staffing.areas.total===1?current.staffing.areas.data[0]:null;
      setArea(currentArea&&!currentArea.retired?currentArea:null);
      const currentSuper=current.staffing.reporting?.superintendent;
      setSuperintendent(currentSuper?.active&&currentSuper.role==='SURVEY_SUPERINTENDENT'?currentSuper:null);
      setDraft('');setSearch('');setOffset(0);setPicker(null);setRevision(n=>n+1);editorHeading.current?.focus();
    }catch(cause){setError(getErrorMessage(cause,'Unable to read current staffing. Keep this review open and try again.'));}
    finally{setLoading(false);}
  }
  function chooseUnlink(kind: StaffingLinkKind, linkId: UUID, label: string) {
    if (stale || !command.reset()) return; setUnlinkSuccess(null); setUnlinkConfirmed(false); setUnlink({ kind,linkId,label }); setPicker(null);
  }
  function keepLink() { if (stale || !command.reset()) return; setUnlink(null); setUnlinkConfirmed(false); currentHeading.current?.focus(); }
  function submitUnlink(event: FormEvent) {
    event.preventDefault();
    if (!baseline || !detail || !unlink || stale || readOnly || loading || error || !unlinkConfirmed) return;
    const input = { action: 'unlink' as const, kind: unlink.kind, linkId: unlink.linkId, partyChiefId: person.userId,
      expectedSnapshot: baseline.snapshotToken, confirmUnlink: true as const };
    void command.run('unlink',input,key => apiClient.unlinkSurveyStaffing(projectId,input,key),() => {
      setUnlinkSuccess(`${unlink.label} unlinked. Roles, accounts and request history are unchanged.`); void reload(false,true);
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!baseline || !detail || !area || stale || blockedAreas || readOnly || loading || !confirmed) return;
    const input = { partyChiefId: person.userId, expectedSnapshot: baseline.snapshotToken, areaId: area.id,
      superintendentId: project.crewBuild === 'FULL' ? superintendent?.userId ?? null : null,
      instrumentManIds: selected.map(item => item.userId).sort(), confirmRoleChanges: confirmed };
    void command.run('staffing',input,key => apiClient.saveSurveyStaffing(projectId,input,key),saved);
  }
  return <div className="tm-editor stack" aria-label={`Staffing for ${person.name}`}>
    <div className="tm-heading"><div><h3 className="panel-title" ref={editorHeading} tabIndex={-1}>Staffing For {person.name}</h3><p className="muted">{person.email}</p></div><Button type="button" variant="secondary" disabled={command.busy || command.uncertain || loading} onClick={()=>{if(stale)void reload(true);else cancel();}}>{stale?'Reload personnel':'Back to personnel'}</Button></div>
    <p className="muted">Explicit operational assignments, independent of named teams. {readOnly ? 'Closed project — read only.' : 'Roster saves add people; they never remove existing Instrument Men or alter request history.'}</p>
    {unlinkSuccess ? <SuccessBanner message={unlinkSuccess} /> : null}
    {baseline ? <section className="tm-section"><h4 ref={currentHeading} tabIndex={-1}>Current Assignments</h4>
      <p><strong>Area:</strong> {baseline.areas.total === 0 ? 'No explicit Area assignment' : baseline.areas.data.map(item => `${item.name}${item.retired ? ' (retired)' : ''}`).join(', ')}{baseline.areas.truncated ? ` · Showing ${baseline.areas.data.length} of ${baseline.areas.total}` : ''}</p>
      <p><strong>Reports to:</strong> {baseline.reporting ? `${baseline.reporting.superintendent.name} · ${baseline.reporting.area.name}${!baseline.reporting.superintendent.active ? ' · Inactive' : ''}${baseline.reporting.area.retired ? ' · Retired Area' : ''}${baseline.reporting.superintendent.role !== 'SURVEY_SUPERINTENDENT' ? ' · Role changed' : ''}` : 'No explicit Superintendent link'}</p>
      {!readOnly && !unlink ? <div className="stack">{baseline.reporting ? <div><Button type="button" variant="secondary" disabled={command.locked || stale || loading || !!error} onClick={() => chooseUnlink('reporting',baseline.reporting!.id,`Superintendent link to ${baseline.reporting!.superintendent.name}`)}>Unlink Superintendent</Button></div> : null}
        <details className="tm-area-picker"><summary>Manage Current Area Assignments ({baseline.areas.total})</summary><div className="stack"><p className="muted">Unlink one individual Area assignment. Department scope stays unchanged. A dependent Superintendent link must be unlinked or replaced first.</p><RecordCollection label="assigned Areas" records={<>{baseline.areas.data.map(item => <li key={item.id}><span>{item.name}{item.retired ? ' · Retired' : ''}{!item.individualAssignmentId ? <span className="tm-email muted">Department scope or duplicate individual assignments — IT must resolve</span> : null}</span>{item.individualAssignmentId ? <Button type="button" variant="secondary" aria-label={`Unlink Area ${item.name}`} disabled={command.locked || stale || loading || !!error} onClick={() => chooseUnlink('area',item.individualAssignmentId!,`Area assignment: ${item.name}`)}>Unlink Area</Button> : null}</li>)}</>}/>{baseline.areas.truncated ? <p className="muted">Only the first {baseline.areas.data.length} of {baseline.areas.total} Areas are shown. This is not a complete assignment list; IT must resolve undisplayed scope.</p> : null}</div></details>
      </div> : null}
      <details className="tm-area-picker" open={rosterOpen} onToggle={event => setRosterOpen(event.currentTarget.open)}><summary>Current Instrument Men ({baseline.instrumentManTotal})</summary><div className="stack"><SearchControls page={roster} label="Search current roster" disabled={command.locked || !!unlink} /><PageState page={roster} empty="No current roster members match this search." /><RecordCollection label="assigned Instrument Men" records={<>{detail?.instrumentMen.data.map(item => <li className="tm-person" key={item.userId}><div><strong>{item.name}</strong><span className="tm-email muted">{item.email}</span></div><div>{item.role ? roleLabel(item.role) : 'No project role'}{!item.active ? ' · Inactive' : ''}</div>{!readOnly && item.rosterLinkId && !unlink ? <Button type="button" variant="secondary" aria-label={`Unlink Instrument Man ${item.name}`} disabled={command.locked || stale || loading || !!error} onClick={() => chooseUnlink('roster',item.rosterLinkId!,`Crew link: ${item.name}`)}>Unlink crew member</Button> : null}</li>)}</>}/><PageFooter page={roster} /></div></details>
    </section> : <PageState page={roster} empty="" />}
    {baseline&&error?<p role="alert">Current staffing could not be loaded. Your reviewed staffing remains held; Reload current staffing must successfully read current evidence and choices before another decision.</p>:null}
    {baseline && error && !rosterOpen ? <div className="stack"><ErrorBanner message={error} /><Button type="button" variant="secondary" onClick={roster.retry}>Retry staffing read</Button></div> : null}
    {stale ? <ErrorBanner message="Project staffing changed while you were reviewing it. Reload current staffing before saving; your draft will be discarded." /> : null}
    {blockedAreas && !readOnly ? <p role="status">This Chief has multiple Area assignments. Staffing saves cannot reassign or replace them. You may explicitly unlink a displayed individual assignment; undisplayed or protected scope needs IT review.</p> : null}
    {unlink && baseline && !readOnly ? <form className="tm-section stack" onSubmit={submitUnlink}><h4 ref={unlinkHeading} tabIndex={-1}>Unlink {unlink.label}?</h4><p>This removes only this current operational link from {person.name}. The account, project membership, role, named teams and request history remain unchanged. Role removal is a separate action.</p>{selected.length || confirmed ? <p className="muted">A successful unlink reloads current staffing and discards proposed additions.</p> : null}<label className="tm-check"><input type="checkbox" checked={unlinkConfirmed} disabled={command.locked} onChange={event => setUnlinkConfirmed(event.target.checked)} /><span>I confirm unlinking {unlink.label}.</span></label>{command.error && !stale ? <ErrorBanner message={command.error} /> : null}<div className="row"><Button type="submit" variant="danger" disabled={command.busy || command.stale || stale || loading || !!error || !detail || !unlinkConfirmed}>{command.busy ? 'Unlinking…' :command.uncertain?'Retry unchanged unlink':'Confirm unlink'}</Button><Button type="button" variant="secondary" disabled={command.locked || stale || loading} onClick={keepLink}>Keep link</Button><Button type="button" variant="secondary" disabled={command.busy || command.uncertain || loading} onClick={()=>void reload()}>Reload current staffing</Button></div><p className="muted">After an uncertain response, retry this unchanged confirmation. After a definitive conflict, reload current staffing.</p></form> : null}
    {baseline && !readOnly && !blockedAreas && !unlink ? <>
      <section className="tm-section"><h4>Proposed Assignments</h4><p className="muted">Area: <strong>{area?.name ?? 'Select an active Area'}</strong>{project.crewBuild === 'FULL' ? <> · Superintendent: <strong>{superintendent?.name ?? 'Select a Superintendent'}</strong></> : null}</p>
        <p className="muted">Choosing a Superintendent replaces the current reporting link. The server checks their Area authority. A different existing Chief Area cannot be reassigned here.</p>
        <div className="row"><Button type="button" variant="secondary" disabled={command.locked} aria-expanded={picker === 'area'} id="tm-select-staffing-area" aria-controls={picker === 'area' ? 'tm-staffing-area' : undefined} onClick={() => setPicker(picker === 'area' ? null : 'area')}>Select Area</Button>{project.crewBuild === 'FULL' ? <Button type="button" variant="secondary" disabled={command.locked} aria-expanded={picker === 'superintendent'} id="tm-select-staffing-superintendent" aria-controls={picker === 'superintendent' ? 'tm-staffing-people' : undefined} onClick={() => setPicker(picker === 'superintendent' ? null : 'superintendent')}>Select Superintendent</Button> : null}<Button type="button" variant="secondary" disabled={command.locked} aria-expanded={picker === 'instrument'} aria-controls={picker === 'instrument' ? 'tm-staffing-people' : undefined} onClick={() => setPicker(picker === 'instrument' ? null : 'instrument')}>Add Instrument Men</Button></div>
        {picker === 'area' ? <div id="tm-staffing-area" className="stack"><SearchControls page={areas} label="Search active Areas" disabled={command.locked} /><PageState page={areas} empty="No active Areas match. IT manages Area setup." /><div className="tm-area-options"><RecordCollection label="active Areas" records={<>{areas.data?.data.map(item => <Button key={item.id} type="button" variant="secondary" disabled={command.locked} aria-pressed={area?.id === item.id} onClick={() => { setArea(item); setConfirmed(false); setPicker(null); document.getElementById('tm-select-staffing-area')?.focus(); }}>{item.name}</Button>)}</>}/></div><PageFooter page={areas} /></div> : null}
        {picker === 'instrument' || picker === 'superintendent' ? <div id="tm-staffing-people" className="stack"><SearchControls page={candidates} label="Search project name, email or role" disabled={command.locked} /><PageState page={candidates} empty="No project personnel match. Try a name or role; IT manages membership." /><p className="muted">{picker === 'superintendent' ? 'Only active Survey Superintendents can be selected.' : 'Choose active Instrument Men. A person already linked to another Chief cannot be added; the server verifies this on save.'}</p><RecordCollection label="staffing candidates" records={<>{candidates.data?.data.map(item => {
          const picked = selected.some(value => value.userId === item.userId);
          const eligible = item.active && (picker === 'superintendent' ? item.role === 'SURVEY_SUPERINTENDENT' : item.role==='INSTRUMENT_MAN');
          const current = detail?.instrumentMen.data.some(value => value.userId === item.userId);
          return <li className="tm-person" key={item.userId}><div><strong>{item.name}</strong><span className="tm-email muted">{item.email}</span></div><div>{roleLabel(item.role)}{picker === 'instrument' && current ? <span className="tm-email muted">Already in this roster</span> : null}</div><Button type="button" variant="secondary" aria-label={`${picker === 'superintendent' ? 'Select Superintendent' : 'Add Instrument Man'} ${item.name}`} disabled={command.locked || !eligible || (picker === 'instrument' && (picked || current || selected.length >= 100))} onClick={() => { setConfirmed(false); if (picker === 'superintendent') { setSuperintendent(item); setPicker(null); document.getElementById('tm-select-staffing-superintendent')?.focus(); } else setSelected(previous => [...previous,item]); }}>{picker === 'superintendent' ? 'Select' : picked ? 'Selected' : current ? 'Linked' : 'Add'}</Button></li>;
        })}</>}/><PageFooter page={candidates} /></div> : null}
      </section>
      <section className="tm-section"><h4>Instrument Man Additions ({selected.length}/100)</h4>{selected.length === 0 ? <p className="muted">None selected. Existing roster members stay assigned.</p> : <RecordCollection label="planned additions" records={<>{selected.map(item => <li key={item.userId}><span><strong>{item.name}</strong><span className="tm-email muted">{roleLabel(item.role)}{item.role !== 'INSTRUMENT_MAN' ? ' → Instrument Man · must sign in again' : ''}</span></span><Button type="button" variant="secondary" aria-label={`Remove addition ${item.name}`} disabled={command.locked} onClick={() => { setSelected(previous => previous.filter(value => value.userId !== item.userId)); setConfirmed(false); }}>Remove addition</Button></li>)}</>}/>}</section>
      <form onSubmit={submit} className="stack"><label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked} onChange={event => setConfirmed(event.target.checked)} /><span>I confirm these explicit staffing additions. Existing roles and request history remain unchanged.</span></label>{command.error && !stale ? <ErrorBanner message={command.error} /> : null}<div className="row"><Button type="submit" disabled={command.busy || command.stale || loading || !!error || !detail || stale || !area || !confirmed || (project.crewBuild === 'FULL' && !superintendent)}>{command.busy ? 'Saving…' :command.uncertain?'Retry unchanged staffing':'Save staffing additions'}</Button><Button type="button" variant="secondary" disabled={command.busy || command.uncertain || loading} onClick={()=>void reload()}>Reload current staffing</Button></div><p className="muted">After an uncertain response, retry the unchanged form. After a definitive conflict, reload reads the latest assignments.</p></form>
    </> : baseline && !readOnly && !unlink ? <Button type="button" variant="secondary" disabled={loading} onClick={()=>void reload()}>Reload current staffing</Button> : null}
  </div>;
}

export function TeamManagement({ projectId,onEditorOpen,onEditorClose }: { projectId: string;onEditorOpen?:()=>boolean;onEditorClose?:()=>void }) {
  const [project,setProject] = useState<TeamProjectContext | null>(null), [contextError,setContextError] = useState<string | null>(null), [revision,setRevision] = useState(0);
  const [tab,setTab] = useState<'personnel' | 'teams' | 'areas'>('personnel');
  const [areaLocked,setAreaLocked]=useState(false);
  const [staffingPerson,setStaffingPerson] = useState<TeamPersonnel | null>(null);
  const [person,setPerson] = useState<TeamPersonnel | null>(null), [editor,setEditor] = useState<{ team: SurveyTeamDetail | null } | null>(null);
  const [detailBusy,setDetailBusy] = useState(false), [detailError,setDetailError] = useState<string | null>(null), [success,setSuccess] = useState<string | null>(null);
  const detailRequest = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true; setProject(null); setContextError(null);
    apiClient.getTeamContext(projectId).then(result => { if (active) setProject(result.project); }).catch(err => { if (active) setContextError(getErrorMessage(err,'Unable to open Team Management. Sign in with a current project Survey Manager account.')); });
    return () => { active = false; detailRequest.current++; };
  }, [projectId,revision]);
  const people = useTeamPage<TeamPersonnel>(projectId,'personnel',!!project && tab === 'personnel' && !person && !staffingPerson,revision);
  const teams = useTeamPage<SurveyTeamSummary>(projectId,'teams',!!project && tab === 'teams' && !editor,revision);
  const readOnly = project?.status === 'ARCHIVED';
  function refresh(message?: string) { onEditorClose?.(); setStaffingPerson(null); setPerson(null); setEditor(null); setDetailError(null); setRevision(value => value + 1); if (message) setSuccess(message); heading.current?.focus(); }
  async function openTeam(teamId: string) {
    if(onEditorOpen&&!onEditorOpen())return;
    const request = ++detailRequest.current; setDetailBusy(true); setDetailError(null); setSuccess(null);
    try { const result = await apiClient.getSurveyTeam(projectId,teamId); if (request === detailRequest.current) setEditor({ team: result.team }); }
    catch (err) { onEditorClose?.();if (request === detailRequest.current) setDetailError(getErrorMessage(err,'Unable to load current team details. Retry View team.')); }
    finally { if (request === detailRequest.current) setDetailBusy(false); }
  }
  function switchTab(next: typeof tab) { detailRequest.current++; setDetailBusy(false); setTab(next); setStaffingPerson(null); setPerson(null); setEditor(null); setSuccess(null); setDetailError(null); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
    event.preventDefault(); const tabs=['personnel','teams','areas'] as const;const next = event.key === 'Home' ? 'personnel' : event.key === 'End' ? 'areas' : tabs[(tabs.indexOf(tab)+(event.key==='ArrowRight'?1:2))%3]!;
    switchTab(next); document.getElementById(`tm-tab-${next}`)?.focus();
  }
  return <section className="panel tm-workspace" aria-labelledby="tm-title">
    <div className="panel-heading"><HeadingHelp label={"Team Management"} heading={<h2 className="panel-title" id="tm-title" tabIndex={-1} ref={heading}>Team Management</h2>} help={<span>Manage survey roles, teams and Areas. Teams give surveyors access to requests in their assigned Areas; crew assignments connect Instrument Men to Party Chiefs.</span>}/></div>
    {!project && !contextError ? <p role="status" className="muted">Checking project access…</p> : null}
    {contextError ? <div className="stack"><ErrorBanner message={contextError} /><Button type="button" variant="secondary" onClick={() => refresh()}>Retry project access</Button></div> : null}
    {project ? <>
      {!readOnly?<SurveySetupGuide disabled={areaLocked||detailBusy||!!person||!!editor||!!staffingPerson} onSelect={value=>{switchTab(value);document.getElementById(`tm-tab-${value}`)?.focus();}}/>:null}
      <div className="tm-tabs" role="tablist" aria-label="Team Management views">{(['personnel','teams','areas'] as const).map(value => <button type="button" role="tab" className="tm-tab" key={value} id={`tm-tab-${value}`} aria-selected={tab === value} aria-controls={`tm-panel-${value}`} tabIndex={tab === value ? 0 : -1} disabled={areaLocked || detailBusy || !!person || !!editor || !!staffingPerson} onKeyDown={tabKey} onClick={() => switchTab(value)}>{value === 'personnel' ? 'Personnel' : value === 'areas' ? 'Areas' : 'Teams'}</button>)}</div>
      <p className="muted tm-scope">{project.crewBuild === 'FULL' ? 'Full' : project.crewBuild === 'MEDIUM' ? 'Medium' : 'Slim'} crew build · One active named team per person{readOnly ? ' · Closed project — read only' : ''}</p>
      {success ? <SuccessBanner message={success} /> : null}{detailError ? <ErrorBanner message={detailError} /> : null}
      <div role="tabpanel" id={`tm-panel-${tab}`} aria-labelledby={`tm-tab-${tab}`}>
        {tab === 'areas' ? <SurveyAreas projectId={projectId} readOnly={readOnly} onLockChange={locked=>{setAreaLocked(locked);if(locked)onEditorOpen?.();else onEditorClose?.();}}/> : tab === 'personnel' ? staffingPerson ? <StaffingEditor key={staffingPerson.userId} projectId={projectId} person={staffingPerson} project={project} cancel={() => refresh()} saved={() => refresh('Staffing saved. Existing roster members and request history are retained.')} /> : person ? <RoleEditor key={person.userId} projectId={projectId} person={person} project={project} cancel={() => refresh()} reload={async()=>{await Promise.all([apiClient.getTeamContext(projectId),apiClient.listTeamPersonnel(projectId,{search:person.email,limit:10,offset:0})]);}} saved={() => refresh('Project role saved. The person must sign in again.')} /> : <div className="stack"><SearchControls page={people} label="Search name, email or role" /><PageState page={people} empty="No personnel match. Try another search; IT manages project membership and invitations." /><RecordCollection label="survey personnel" records={<>{people.data?.data.map(item => <li className="tm-person" key={item.userId}><div><strong>{item.name}</strong><span className="tm-email muted">{item.email}</span></div><div><span>{roleLabel(item.role)}</span><span className="tm-email muted">{item.teamName ? `Team: ${item.teamName}` : supportedTeamRoles(project.crewBuild).includes(item.role) ? 'Available for a team' : 'No named team'}</span></div><div className="tm-person-actions">{['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(item.role)?<MemberKpiEntry projectId={projectId} role="SURVEY_MANAGER" person={{...item,partyChiefId:null}}/>:null}{item.role === 'PARTY_CHIEF' && project.crewBuild !== 'SLIM' ? <Button type="button" variant="secondary" aria-label={`Staffing for ${item.name}`} disabled={!item.active} onClick={() => { if(onEditorOpen&&!onEditorOpen())return;setStaffingPerson(item); setSuccess(null); }}>Staffing</Button> : null}<Button type="button" variant="secondary" aria-label={`${readOnly?'View role and obligations for':'Change role for'} ${item.name}`} disabled={!canEditSurveyRole(item.role)} onClick={() => { if(onEditorOpen&&!onEditorOpen())return;setPerson(item); setSuccess(null); }}>{readOnly?'View role / obligations':'Change role'}</Button></div></li>)}</>}/><PageFooter page={people} /></div> : editor && readOnly && editor.team ? <ClosedTeamDetail team={editor.team} back={() => refresh()} /> : editor ? <TeamEditor key={editor.team?.id ?? 'new'} projectId={projectId} project={project} initial={editor.team} cancel={() => refresh()} reload={()=>Promise.all([apiClient.getTeamContext(projectId),apiClient.listSurveyTeams(projectId,{search:'',limit:10,offset:0}),apiClient.listTeamPersonnel(projectId,{search:'',limit:10,offset:0}),apiClient.listTeamAreas(projectId,{search:'',limit:10,offset:0})])} saved={outcome => refresh(outcome === 'deleted' ? 'Team deleted. Members are available for another named team. Request history is retained.' : 'Team changes saved. Existing request assignments and history are retained.')} /> : <div className="stack"><div className="tm-heading"><HeadingHelp label="Survey Teams" heading={<h3>Survey Teams</h3>} help="Teams bring together a lead and surveyors to cover one or more Areas." /><Button type="button" disabled={readOnly || detailBusy} onClick={() => { if(onEditorOpen&&!onEditorOpen())return;setEditor({ team: null }); setSuccess(null); }}>Create team</Button></div><SearchControls page={teams} label="Search team name or Area" /><PageState page={teams} empty="No teams match. Create a team from existing survey personnel, or change the search." />{detailBusy ? <p role="status" className="muted">Loading current team details…</p> : null}<RecordCollection label="survey teams" records={<>{teams.data?.data.map(item => <li className="tm-person" key={item.id}><div><strong>{item.name}</strong><span className="tm-email muted">{(item.areas ?? [{id:item.areaId,name:item.areaName}]).map(area=>area.name).join(', ')} · {item.memberCount} members</span></div><div><span>{item.lead.name}</span><span className="tm-email muted">Team lead · {roleLabel(item.lead.role)}</span></div><Button type="button" variant="secondary" disabled={detailBusy} onClick={() => void openTeam(item.id)}>{readOnly ? 'View team' : 'View / edit team'}</Button></li>)}</>}/><PageFooter page={teams} /></div>}
      </div>
    </> : null}
  </section>;
}
