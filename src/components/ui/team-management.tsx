'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { Page, UUID } from '@/shared/types';
import type { TeamArea, TeamPersonnel, TeamPerson, TeamProjectContext, SurveyTeamDetail, SurveyTeamSummary } from '@/modules/tenancy/application/survey-teams';
import type { ManagedSurveyRole } from '@/modules/tenancy/application/change-survey-role';
import { addTeamSelection, canEditSurveyRole, removeTeamSelection, roleLabel, supportedTeamRoles } from '@/lib/team-management-view';
import { Button, ErrorBanner, SuccessBanner } from '@/components/ui';
import { PaginationControls } from '@/components/forms';
import './team-management.css';

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
type PageControls = ReturnType<typeof useTeamPage>;
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
function useTeamCommand() {
  const [busy,setBusy] = useState(false), [error,setError] = useState<string | null>(null);
  const running = useRef(false), attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  async function run(kind: string, payload: unknown, execute: (key: string) => Promise<unknown>, done: () => void) {
    if (running.current) return;
    const fingerprint = JSON.stringify([kind,payload]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    running.current = true; setBusy(true); setError(null);
    try { await execute(attempt.current.key); attempt.current = null; done(); }
    catch (err) { setError(getErrorMessage(err, 'Unable to save. Retry without changing the form, or reload current data.')); }
    finally { running.current = false; setBusy(false); }
  }
  return { busy,error,run };
}
function RoleEditor({ projectId, person, project, cancel, saved }: { projectId: string; person: TeamPersonnel; project: TeamProjectContext; cancel: () => void; saved: () => void }) {
  const roles = [...supportedTeamRoles(project.crewBuild),'REQUESTER'] as ManagedSurveyRole[];
  const [role,setRole] = useState<ManagedSurveyRole>(roles.includes(person.role as ManagedSurveyRole) ? person.role as ManagedSurveyRole : roles[0]!);
  const [confirmed,setConfirmed] = useState(false);
  const command = useTeamCommand();
  const editorHeading = useEditorHeadingFocus();
  function submit(event: FormEvent) {
    event.preventDefault();
    const input = { userId: person.userId, expectedRole: person.role, expectedRoleVersion: person.roleVersion, role, confirmRoleChanges: confirmed };
    void command.run('role',input,key => apiClient.changeSurveyRole(projectId,input,key),saved);
  }
  return <form className="tm-editor stack" onSubmit={submit} aria-label={`Change role for ${person.name}`}>
    <div><h3 className="panel-title" tabIndex={-1} ref={editorHeading}>Change project role</h3><p className="muted">{person.name} · {person.email}</p></div>
    <p>Current role: <strong>{roleLabel(person.role)}</strong></p>
    <label className="field"><span className="field-label">New role</span><select className="select" value={role} disabled={command.busy} onChange={event => { setRole(event.target.value as ManagedSurveyRole); setConfirmed(false); }}>{roles.map(value => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
    <p className="muted">Removing a survey role keeps this person as a Requester. Active team, crew, reporting and authority obligations must be resolved first. Request history is retained; active work may need separate reassignment.</p>
    <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.busy} onChange={event => setConfirmed(event.target.checked)} /><span>I confirm this role change and understand this person must sign in again.</span></label>
    {command.error ? <ErrorBanner message={command.error} /> : null}
    <div className="row"><Button type="submit" disabled={command.busy || !confirmed || role === person.role}>{command.busy ? 'Saving…' : 'Save role'}</Button><Button type="button" variant="secondary" disabled={command.busy} onClick={cancel}>{command.error ? 'Reload personnel' : 'Cancel'}</Button></div>
  </form>;
}
function TeamEditor({ projectId, project, initial, cancel, saved }: { projectId: string; project: TeamProjectContext; initial: SurveyTeamDetail | null; cancel: () => void; saved: () => void }) {
  const [name,setName] = useState(initial?.name ?? ''), [area,setArea] = useState<TeamArea | null>(initial ? { id: initial.areaId, name: initial.areaName } : null);
  const [selected,setSelected] = useState<TeamPerson[]>(initial?.members ?? []), [lead,setLead] = useState(initial?.lead.userId ?? '');
  const [deleting,setDeleting] = useState(false), [confirmed,setConfirmed] = useState(false);
  const [areaPickerOpen,setAreaPickerOpen] = useState(!initial);
  const people = useTeamPage<TeamPersonnel>(projectId,'personnel',!deleting);
  const areas = useTeamPage<TeamArea>(projectId,'areas',!deleting && areaPickerOpen);
  const command = useTeamCommand();
  const editorHeading = useEditorHeadingFocus(deleting);
  const validRoles = supportedTeamRoles(project.crewBuild);
  const validSelection = selected.length > 0 && selected.every(person => person.active && validRoles.includes(person.role)) && selected.some(person => person.userId === lead);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!area) return;
    const input = { teamId: initial?.id ?? null, expectedVersion: initial?.rowVersion ?? null, name: name.trim(), areaId: area.id, leadUserId: lead as UUID, memberIds: selected.map(person => person.userId) };
    void command.run('save',input,key => apiClient.saveSurveyTeam(projectId,input,key),saved);
  }
  if (deleting && initial) return <form className="tm-editor stack" onSubmit={event => { event.preventDefault(); void command.run('delete',{ id: initial.id, version: initial.rowVersion },key => apiClient.deleteSurveyTeam(projectId,initial.id,initial.rowVersion,key),saved); }}>
    <h3 className="panel-title" tabIndex={-1} ref={editorHeading}>Delete {initial.name}?</h3><p>Its {initial.memberCount} members become available for another named team. Accounts, roles, reporting links and request history remain unchanged. The team record is retained in history.</p>
    <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.busy} onChange={event => setConfirmed(event.target.checked)} /><span>I confirm deletion of this team.</span></label>{command.error ? <ErrorBanner message={command.error} /> : null}
    <div className="row"><Button type="submit" variant="danger" disabled={!confirmed || command.busy}>{command.busy ? 'Deleting…' : 'Delete team'}</Button><Button type="button" variant="secondary" disabled={command.busy} onClick={() => setDeleting(false)}>Keep team</Button><Button type="button" variant="secondary" disabled={command.busy} onClick={cancel}>Reload teams</Button></div>
  </form>;
  return <div className="tm-editor stack">
    <div className="tm-heading"><h3 className="panel-title" tabIndex={-1} ref={editorHeading}>{initial ? `Edit ${initial.name}` : 'Create team'}</h3><Button type="button" variant="secondary" disabled={command.busy} onClick={cancel}>Back to teams</Button></div>
    <p className="muted">This is an organizational group. Selecting an Area does not grant Area access or establish Superintendent → Party Chief → Instrument Man reporting.</p>
    <form id="tm-save-team" onSubmit={submit} className="tm-basics">
      <label className="field"><span className="field-label">Team name</span><input className="input" required maxLength={80} value={name} disabled={command.busy} onChange={event => setName(event.target.value)} /></label>
      <label className="field"><span className="field-label">Team lead — selected member</span><select className="select" required value={lead} disabled={command.busy} onChange={event => setLead(event.target.value)}><option value="">Choose a lead</option>{selected.map(person => <option key={person.userId} value={person.userId} disabled={!person.active || !validRoles.includes(person.role)}>{person.name} · {roleLabel(person.role)}</option>)}</select></label>
    </form>
    <section className="tm-section"><h4>Project Area</h4><p className="muted">Selected: <strong>{area?.name ?? 'No Area selected'}</strong></p>
      <details className="tm-area-picker" open={areaPickerOpen} onToggle={event => setAreaPickerOpen(event.currentTarget.open)}><summary>{area ? 'Change Area' : 'Select an Area'}</summary><div className="stack"><SearchControls page={areas} label="Search active Areas" disabled={command.busy} /><PageState page={areas} empty="No active Areas match. Try another search; IT manages Area setup." />
      <div className="tm-area-options">{areas.data?.data.map(item => <Button key={item.id} type="button" variant="secondary" aria-pressed={area?.id === item.id} disabled={command.busy} onClick={() => { setArea(item); setAreaPickerOpen(false); }}>{item.name}</Button>)}</div><PageFooter page={areas} /></div></details>
    </section>
    <section className="tm-section"><h4>Selected members ({selected.length}/100)</h4><p className="muted">Selections stay here as you search. Choose another lead before removing the current lead.</p>
      {selected.length === 0 ? <p className="tm-empty">Select survey personnel below, then choose a lead.</p> : <ul className="tm-selected">{selected.map(person => <li key={person.userId}><span><strong>{person.name}</strong><span className="muted"> · {roleLabel(person.role)}{!person.active ? ' · Inactive — remove or replace' : ''}{person.userId === lead ? ' · Team lead' : ''}</span></span><Button type="button" variant="secondary" aria-label={`Remove ${person.name}`} disabled={command.busy || person.userId === lead} onClick={() => setSelected(removeTeamSelection(selected,person.userId,lead))}>Remove</Button></li>)}</ul>}
    </section>
    <section className="tm-section"><h4>Add project personnel</h4><SearchControls page={people} label="Search name, email or role" disabled={command.busy} /><PageState page={people} empty="No personnel match. Try another search; IT manages project membership." />
      <ul className="tm-list">{people.data?.data.map(person => {
        const picked = selected.some(member => member.userId === person.userId);
        const elsewhere = person.teamId !== null && person.teamId !== initial?.id;
        const eligible = person.active && validRoles.includes(person.role);
        return <li key={person.userId} className="tm-person"><div><strong>{person.name}</strong><span className="tm-email muted">{person.email}</span></div><div><span>{roleLabel(person.role)}</span><span className="tm-email muted">{picked ? 'Selected' : elsewhere ? `Assigned elsewhere: ${person.teamName}` : eligible ? 'Available' : 'Assign a supported survey role first'}</span></div><Button type="button" variant="secondary" aria-label={`Add ${person.name}`} disabled={command.busy || picked || elsewhere || !eligible || selected.length >= 100} onClick={() => setSelected(addTeamSelection(selected,person))}>{picked ? 'Selected' : 'Add'}</Button></li>;
      })}</ul><PageFooter page={people} />
    </section>
    {command.error ? <ErrorBanner message={command.error} /> : null}<div className="tm-footer"><div className="row"><Button form="tm-save-team" type="submit" disabled={command.busy || !name.trim() || !area || !validSelection}>{command.busy ? 'Saving…' : initial ? 'Save team' : 'Create team'}</Button><Button type="button" variant="secondary" disabled={command.busy} onClick={cancel}>{command.error ? 'Reload teams' : 'Cancel'}</Button></div>{initial ? <Button type="button" variant="danger" disabled={command.busy} onClick={() => setDeleting(true)}>Delete team…</Button> : null}</div>
  </div>;
}

function ClosedTeamDetail({ team, back }: { team: SurveyTeamDetail; back: () => void }) {
  const editorHeading = useEditorHeadingFocus();
  return <div className="stack"><div className="tm-heading"><h3 className="panel-title" tabIndex={-1} ref={editorHeading}>{team.name}</h3><Button type="button" variant="secondary" onClick={back}>Back to teams</Button></div>
    <p className="muted">Closed project — read only · {team.areaName} · Lead: {team.lead.name}</p>
    <ul className="tm-list">{team.members.map(member => <li className="tm-person" key={member.userId}><div><strong>{member.name}</strong><span className="tm-email muted">{member.email}</span></div><div>{roleLabel(member.role)}<span className="tm-email muted">{member.userId === team.lead.userId ? 'Team lead' : 'Member'}{!member.active ? ' · Inactive' : ''}</span></div></li>)}</ul>
  </div>;
}

export function TeamManagement({ projectId }: { projectId: string }) {
  const [project,setProject] = useState<TeamProjectContext | null>(null), [contextError,setContextError] = useState<string | null>(null), [revision,setRevision] = useState(0);
  const [tab,setTab] = useState<'personnel' | 'teams'>('personnel');
  const [person,setPerson] = useState<TeamPersonnel | null>(null), [editor,setEditor] = useState<{ team: SurveyTeamDetail | null } | null>(null);
  const [detailBusy,setDetailBusy] = useState(false), [detailError,setDetailError] = useState<string | null>(null), [success,setSuccess] = useState<string | null>(null);
  const detailRequest = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true; setProject(null); setContextError(null);
    apiClient.getTeamContext(projectId).then(result => { if (active) setProject(result.project); }).catch(err => { if (active) setContextError(getErrorMessage(err,'Unable to open Team Management. Sign in with a current project Survey Manager account.')); });
    return () => { active = false; detailRequest.current++; };
  }, [projectId,revision]);
  const people = useTeamPage<TeamPersonnel>(projectId,'personnel',!!project && tab === 'personnel' && !person,revision);
  const teams = useTeamPage<SurveyTeamSummary>(projectId,'teams',!!project && tab === 'teams' && !editor,revision);
  const readOnly = project?.status === 'ARCHIVED';
  function refresh(message?: string) { setPerson(null); setEditor(null); setDetailError(null); setRevision(value => value + 1); if (message) setSuccess(message); heading.current?.focus(); }
  async function openTeam(teamId: string) {
    const request = ++detailRequest.current; setDetailBusy(true); setDetailError(null); setSuccess(null);
    try { const result = await apiClient.getSurveyTeam(projectId,teamId); if (request === detailRequest.current) setEditor({ team: result.team }); }
    catch (err) { if (request === detailRequest.current) setDetailError(getErrorMessage(err,'Unable to load current team details. Retry View team.')); }
    finally { if (request === detailRequest.current) setDetailBusy(false); }
  }
  function switchTab(next: typeof tab) { detailRequest.current++; setDetailBusy(false); setTab(next); setPerson(null); setEditor(null); setSuccess(null); setDetailError(null); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 'personnel' : event.key === 'End' ? 'teams' : tab === 'personnel' ? 'teams' : 'personnel';
    switchTab(next); document.getElementById(`tm-tab-${next}`)?.focus();
  }
  return <section className="panel tm-workspace" aria-labelledby="tm-title">
    <div className="panel-heading"><h2 className="panel-title" id="tm-title" tabIndex={-1} ref={heading}>Team Management</h2><p className="muted">Manage existing project personnel and named survey teams. Team membership does not grant Area authority or reporting access.</p></div>
    {!project && !contextError ? <p role="status" className="muted">Checking project access…</p> : null}
    {contextError ? <div className="stack"><ErrorBanner message={contextError} /><Button type="button" variant="secondary" onClick={() => refresh()}>Retry project access</Button></div> : null}
    {project ? <>
      <div className="tm-tabs" role="tablist" aria-label="Team Management views">{(['personnel','teams'] as const).map(value => <button type="button" role="tab" className="tm-tab" key={value} id={`tm-tab-${value}`} aria-selected={tab === value} aria-controls={`tm-panel-${value}`} tabIndex={tab === value ? 0 : -1} disabled={!!person || !!editor} onKeyDown={tabKey} onClick={() => switchTab(value)}>{value === 'personnel' ? 'Personnel' : 'Teams'}</button>)}</div>
      <p className="muted tm-scope">{project.crewBuild === 'FULL' ? 'Full' : project.crewBuild === 'MEDIUM' ? 'Medium' : 'Slim'} crew build · One active named team per person{readOnly ? ' · Closed project — read only' : ''}</p>
      {success ? <SuccessBanner message={success} /> : null}{detailError ? <ErrorBanner message={detailError} /> : null}
      <div role="tabpanel" id={`tm-panel-${tab}`} aria-labelledby={`tm-tab-${tab}`}>
        {tab === 'personnel' ? person ? <RoleEditor key={person.userId} projectId={projectId} person={person} project={project} cancel={() => refresh()} saved={() => refresh('Project role saved. The person must sign in again.')} /> : <div className="stack"><SearchControls page={people} label="Search name, email or role" /><PageState page={people} empty="No personnel match. Try another search; IT manages project membership and invitations." /><ul className="tm-list">{people.data?.data.map(item => <li className="tm-person" key={item.userId}><div><strong>{item.name}</strong><span className="tm-email muted">{item.email}</span></div><div><span>{roleLabel(item.role)}</span><span className="tm-email muted">{item.teamName ? `Team: ${item.teamName}` : supportedTeamRoles(project.crewBuild).includes(item.role) ? 'Available for a team' : 'No named team'}</span></div><Button type="button" variant="secondary" aria-label={`Change role for ${item.name}`} disabled={readOnly || !canEditSurveyRole(item.role)} onClick={() => { setPerson(item); setSuccess(null); }}>Change role</Button></li>)}</ul><PageFooter page={people} /></div> : editor && readOnly && editor.team ? <ClosedTeamDetail team={editor.team} back={() => refresh()} /> : editor ? <TeamEditor key={editor.team?.id ?? 'new'} projectId={projectId} project={project} initial={editor.team} cancel={() => refresh()} saved={() => refresh('Team changes saved. Operational authority and request history are unchanged.')} /> : <div className="stack"><div className="tm-heading"><p className="muted">Named groups with a project Area, member lead and selected survey personnel.</p><Button type="button" disabled={readOnly || detailBusy} onClick={() => { setEditor({ team: null }); setSuccess(null); }}>Create team</Button></div><SearchControls page={teams} label="Search team name or Area" /><PageState page={teams} empty="No teams match. Create a team from existing survey personnel, or change the search." />{detailBusy ? <p role="status" className="muted">Loading current team details…</p> : null}<ul className="tm-list">{teams.data?.data.map(item => <li className="tm-person" key={item.id}><div><strong>{item.name}</strong><span className="tm-email muted">{item.areaName} · {item.memberCount} members</span></div><div><span>{item.lead.name}</span><span className="tm-email muted">Team lead · {roleLabel(item.lead.role)}</span></div><Button type="button" variant="secondary" disabled={detailBusy} onClick={() => void openTeam(item.id)}>{readOnly ? 'View team' : 'View / edit team'}</Button></li>)}</ul><PageFooter page={teams} /></div>}
      </div>
    </> : null}
  </section>;
}
