'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { AdministrationDialog } from '@/components/ui/administration-dialog';
import { createFixture, canMove, projectMove, type Person, type ProposedMove } from './fixtures';
import type { SurveyOrganization } from '@/modules/tenancy/application/read-survey-organization';
import { organizationChartPeople, type LiveChartPerson } from './survey-org-chart-live-model';
import './survey-org-chart.css';

function Grip() {
  return <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">{[5, 10, 15].flatMap(y => [5, 11].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}</svg>;
}

function ZoomIcon({ direction }: { direction: 'in' | 'out' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6M7 10h6" />{direction === 'in' && <path d="M10 7v6" />}</svg>;
}

export function SurveyOrgChartWorkspace({ organization, onReload, onPropose, reviewedMove, allowCrewMoves = true }: { organization?: SurveyOrganization; onReload?: () => void; onPropose?: (move:ProposedMove) => void; reviewedMove?: ProposedMove; allowCrewMoves?: boolean } = {}) {
  const readOnly = Boolean(organization);
  const editable = Boolean(organization && onPropose);
  const supportedMove = (person:Person,target:Person) => canMove(person,target) && (!organization || person.role !== 'Party Chief' || allowCrewMoves);
  const [people, setPeople] = useState<Person[]>(() => organization ? organizationChartPeople(organization) : createFixture());
  const [movingId, setMovingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposedMove | null>(null);
  const activeProposal = reviewedMove ?? proposal;
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [notice, setNotice] = useState(editable ? 'Drag a grip or use Move to select a governed Team Management review.' : readOnly ? 'Read-only project hierarchy. Collapse branches or zoom to inspect explicit links.' : 'Drag a grip to propose a move, or use the Move button.');
  const [dark, setDark] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [chartWidth, setChartWidth] = useState(1190);
  const chartViewport = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = chartViewport.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setChartWidth(Math.max(1190, entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const returnFocus = useRef<string | null>(null);
  useEffect(() => {
    if (proposal || choosingId || !returnFocus.current) return;
    const id = returnFocus.current;
    returnFocus.current = null;
    const frame = requestAnimationFrame(() => {
      const button = document.querySelector<HTMLButtonElement>(`[data-person="${id}"] .org-card-actions button`);
      if (button?.getClientRects().length) button.focus({ preventScroll: true });
      else chartViewport.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [proposal, choosingId]);
  function choose(id: string) { if (readOnly && !editable) return; returnFocus.current = id; setChoosingId(id); }
  const view = reviewedMove ? people.map(person=>person.id===reviewedMove.personId?{...person,parentId:reviewedMove.destinationId}:person) : proposal ? projectMove(people, proposal) : people;
  const moving = people.find(p => p.id === movingId);
  const subject = people.find(p => p.id === (proposal?.personId ?? choosingId));
  const destination = people.find(p => p.id === proposal?.destinationId);
  const children = (id: string, source = view) => source.filter(p => p.parentId === id);
  const crewSize = (id: string) => children(id, people).length;
  const parentLabel = (person: Person) => {
    const parent = people.find(p => p.id === person.parentId);
    return parent ? `${parent.name}${parent.team ? ` / ${parent.team}` : ''}` : 'Unassigned / Available Personnel';
  };
  function propose(person: Person, target: Person) {
    if (readOnly && !editable) return;
    if (!supportedMove(person, target)) {
      setNotice(`${person.role} cannot move here. Choose ${person.role === 'Party Chief' ? 'another Superintendent' : 'a different Party Chief'}.`);
      return;
    }
    // A hidden crew remains hidden, including after a proposed or committed move.
    // Expand only a destination Superintendent so a relocated Chief is visible.
    if (target.role === 'Survey Superintendent') setCollapsed(current => current.filter(id => id !== target.id));
    returnFocus.current = person.id;
    if(onPropose)onPropose({personId:person.id,destinationId:target.id});
    else setProposal({ personId: person.id, destinationId: target.id });
    setChoosingId(null); setMovingId(null); setHoverId(null);
    setNotice(editable?'Proposed placement only. Complete the existing governed movement review before saving.':'Proposed placement shown. Review before confirming this local move.');
  }
  function drop(event: DragEvent, target: Person) {
    event.preventDefault(); event.stopPropagation();
    if (moving) propose(moving, target);
    setMovingId(null); setHoverId(null);
  }
  function cancel() {
    setProposal(null); setChoosingId(null);
    setNotice('Move canceled. The fixture hierarchy is unchanged.');
  }
  function toggle(id: string) { setCollapsed(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  function card(person: Person) {
    const draggable = (!readOnly || editable) && (person.role === 'Instrument Man' || person.role === 'Party Chief' && allowCrewMoves);
    const live = person as Partial<LiveChartPerson>;
    const valid = moving && supportedMove(moving, person);
    const pending = activeProposal && (person.id === activeProposal.personId || person.parentId === activeProposal.personId ||
      person.id === activeProposal.destinationId && person.role === 'Party Chief' && collapsed.includes(person.id));
    const chief = view.find(p => p.id === person.parentId);
    const detail = person.role === 'Instrument Man' ? chief?.team ?? 'Available for assignment' : person.team ?? person.area;
    return <article key={person.id} data-person={person.id} aria-label={`${person.name}, ${person.role}`} className={`org-person ${person.role === 'Instrument Man' ? 'org-instrument' : ''} ${moving ? valid ? 'org-valid' : 'org-invalid' : ''} ${hoverId === person.id ? 'org-hover' : ''} ${movingId === person.id ? 'org-moving' : ''} ${pending ? 'org-proposed' : ''}`}
      onDragOver={event => { if (!moving) return; event.stopPropagation(); event.preventDefault(); event.dataTransfer.dropEffect = valid ? 'move' : 'none'; setHoverId(person.id); }}
      onDragLeave={() => setHoverId(current => current === person.id ? null : current)} onDrop={event => drop(event, person)}>
      <div className="org-person-top">
        <span className="org-avatar" aria-hidden="true">{person.name.split(' ').map(word => word[0]).join('')}</span>
        <div className="org-identity"><strong>{person.name}</strong><span>{person.role}</span></div>
        {draggable && <button className="org-grip" aria-label={`Move ${person.name}${person.role === 'Party Chief' ? ' and crew' : ''}`} title={person.role === 'Party Chief' ? `Drag all ${crewSize(person.id) + 1} crew members` : 'Drag to a Party Chief'} draggable={!proposal}
          onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', person.id); setMovingId(person.id); setNotice(person.role === 'Party Chief' ? `Moving ${person.name} with ${crewSize(person.id)} Instrument Men. Drop on another Superintendent.` : `Moving ${person.name}. Drop on a different Party Chief.`); }}
          onDragEnd={() => { setMovingId(null); setHoverId(null); }} onClick={() => choose(person.id)}><Grip /></button>}
      </div>
      <div className="org-person-detail">{readOnly ? live.details?.map((value, index) => <span key={index}>{value}</span>) : <><span>{detail}</span>{person.team && <span>{person.area}</span>}</>}</div>
      {readOnly && !!live.retainedCrew?.length && <p className="org-empty">Other retained crew links: {live.retainedCrew.join('; ')}. These people are outside the current Instrument Man population.</p>}
      {person.role !== 'Instrument Man' && <div className="org-card-footer"><span>{person.role === 'Party Chief' ? `${children(person.id).length} Instrument Men${collapsed.includes(person.id) ? ' hidden' : ''}` : person.role === 'Survey Superintendent' ? `${children(person.id).length} crews · ${children(person.id).reduce((total, p) => total + children(p.id).length + 1, 0)} people` : readOnly ? 'Project Survey leadership' : '3 Superintendents'}</span>
        {person.role !== 'Survey Manager' && <button className={`org-text-button ${person.role === 'Party Chief' ? 'org-collapse' : ''}`} aria-label={person.role === 'Party Chief' ? `${collapsed.includes(person.id) ? 'Expand' : 'Collapse'} ${person.name}'s crew` : undefined} aria-expanded={!collapsed.includes(person.id)} aria-controls={`branch-${person.id}`} onClick={() => toggle(person.id)}>{person.role === 'Party Chief' && <svg className={collapsed.includes(person.id) ? 'org-chevron-collapsed' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}{collapsed.includes(person.id) ? 'Expand' : 'Collapse'}</button>}
      </div>}
      {draggable && <div className="org-card-actions"><button className="org-text-button" onClick={() => choose(person.id)}>{person.role === 'Party Chief' ? 'Move Crew' : 'Move'}</button>{pending && <span className="org-pending">Proposed</span>}</div>}
      {moving && hoverId === person.id && <span className={`org-drop-label ${valid ? '' : 'org-drop-reject'}`}>{valid ? 'Release to review move' : person.id === moving.parentId ? 'Already assigned here' : 'Invalid destination'}</span>}
    </article>;
  }
  function chiefBranch(chief: Person) {
    return <section className="org-crew" key={chief.id} aria-label={`${chief.name}'s crew`}>
      {card(chief)}<div id={`branch-${chief.id}`} hidden={collapsed.includes(chief.id)} className="org-members">{children(chief.id).map(card)}{children(chief.id).length === 0 && <p className="org-empty">{readOnly ? 'No current eligible Instrument Men shown in this crew.' : 'No Instrument Men assigned. Drop a person onto this Chief.'}</p>}</div>
    </section>;
  }
  return <main className="org-poc" data-read-only={readOnly} data-theme={dark ? 'dark' : 'light'}>
    <header className="org-header"><a href="/projects" className="org-brand">SWRTracker<span>Survey Operations</span></a><div className="org-header-actions"><span className="org-prototype-label">{editable ? 'Live Project · Visual Editor' : readOnly ? 'Live Project · Read-Only' : 'Exploratory Prototype'}</span><Button variant="secondary" aria-pressed={dark} onClick={() => setDark(value => !value)}>{dark ? 'Light Theme' : 'Dark Theme'}</Button></div></header>
    <div className="org-workspace">
      <div className="org-heading"><div><h1>Survey Team Management</h1><p>{readOnly ? 'Inspect explicit reporting, crews, named teams and Areas.' : 'See the reporting structure. Rebalance a person or an intact crew.'}</p></div><>{readOnly ? <Button variant="secondary" disabled={!!reviewedMove} onClick={onReload}>Reload hierarchy</Button> : <Button variant="secondary" onClick={() => { setPeople(createFixture()); setCollapsed([]); setNotice('Fixture hierarchy reset.'); }}>Reset Demo</Button>}</></div>
      <div className="org-context">{organization ? <><span><strong>{organization.scope?'Your Authorized Scope':'Current Project'}</strong> · {organization.project.crewBuild} Survey Build · {organization.project.status}</span><span>{people.filter(p => p.role === 'Survey Manager').length} Managers · {people.filter(p => p.role === 'Survey Superintendent').length} Superintendents · {people.filter(p => p.role === 'Party Chief').length} Chiefs · {people.filter(p => p.role === 'Instrument Man').length} Instrument Men</span></> : <><span><strong>Demo Project</strong> · Full Survey Build</span><span>1 Manager · 3 Superintendents · 8 Crews · 21 Instrument Men</span></>}</div>
      <p className="org-sandbox-note">{editable ? 'Select a person or crew visually, then review the existing governed Team Management action. Membership, reporting and Areas stay distinct; existing request assignments and history are retained. Unsupported changes remain available through conventional controls.' : readOnly ? 'Current authorized project reads only. Connectors show explicit Superintendent reporting and Chief crew links. Named teams and Area assignments remain separate; leadership grouping does not imply a Manager reporting link. No staffing changes are available here.' : 'Mock personnel only. Confirmed moves last until reset or refresh. Existing Team Management remains the authoritative workflow.'}</p>
      <div className="org-instructions" role="status" aria-live="polite"><span className="org-status-dot" aria-hidden="true" />{notice}</div>
      <p className="org-narrow-note">{editable ? 'Use Move or the grip to choose a destination. Chief transfers require explicit team and Area choices; Superintendents can reassign Instrument Men within their own team only.' : readOnly ? 'The chart scrolls horizontally. Collapse branches or zoom out to inspect the hierarchy.' : 'The chart scrolls horizontally. Use Move / Move Crew when dragging is inconvenient.'}</p>
      <div className="org-chart-container">
      <section ref={chartViewport} className="org-scroll" aria-label="Survey reporting hierarchy" tabIndex={0}>
        <div className="org-chart-stage" style={{ minWidth: chartWidth * zoom / 100 }}>
        <div className="org-chart" style={{ width: chartWidth, zoom: zoom / 100 }}>
          {readOnly && view.some(p=>p.role==='Survey Manager') && <h2>Survey Leadership</h2>}
          {(readOnly ? view.filter(p => p.role === 'Survey Manager') : [view.find(p => p.id === 'manager')!]).map(manager => <div className="org-manager" key={manager.id}>{card(manager)}</div>)}
          {readOnly && <h2>Explicit Reporting and Crews</h2>}
          <div className="org-superintendents">{(readOnly ? view.filter(p => p.role === 'Survey Superintendent') : children('manager')).map(sup => <section className="org-branch" key={sup.id} aria-label={`${sup.name}'s reporting branch`}>
            {card(sup)}
            <div id={`branch-${sup.id}`} hidden={collapsed.includes(sup.id)} className="org-crews">{children(sup.id).map(chiefBranch)}</div>
          </section>)}</div>
          {readOnly && view.some(p => p.role === 'Party Chief' && !p.parentId) && <section aria-label="Chiefs outside current Superintendent reporting branches"><h2>Chiefs Outside Current Reporting Branches</h2><p className="org-empty">No eligible Superintendent link is shown. Individual reporting evidence stays on each card.</p><div className="org-superintendents">{view.filter(p => p.role === 'Party Chief' && !p.parentId).map(chiefBranch)}</div></section>}
          {readOnly && !people.length && <p role="status">No active survey personnel are available in this project.</p>}
        </div>
        </div>
      </section>
      <div className="org-toolbar" role="group" aria-label="Org-chart zoom">
        <Button className="org-zoom-button" variant="secondary" aria-label="Zoom Out" title="Zoom Out" disabled={zoom === 50} onClick={() => setZoom(value => Math.max(50, value - 10))}><ZoomIcon direction="out" /></Button>
        <output aria-live="polite" aria-label="Current chart zoom">{zoom}%</output>
        <Button className="org-zoom-button" variant="secondary" aria-label="Zoom In" title="Zoom In" disabled={zoom === 150} onClick={() => setZoom(value => Math.min(150, value + 10))}><ZoomIcon direction="in" /></Button>
        <Button variant="secondary" disabled={zoom === 100} onClick={() => setZoom(100)}>Reset to 100%</Button>
      </div>
      </div>
      <section className="org-available" aria-labelledby="available-title"><div className="org-available-heading"><div><h2 id="available-title">{readOnly ? 'Instrument Men Outside Displayed Crews' : 'Unassigned / Available Personnel'}</h2><p>{readOnly ? 'No eligible Chief link is shown. This is not an availability or reassignment decision.' : 'Project surveyors ready for a crew assignment.'}</p></div><span>{view.filter(p => p.role === 'Instrument Man' && !p.parentId).length} {readOnly ? 'outside displayed crews' : 'available'}</span></div><div className="org-available-list">{view.filter(p => p.role === 'Instrument Man' && !p.parentId).map(card)}{!view.some(p => p.role === 'Instrument Man' && !p.parentId) && <p>{readOnly ? 'All current Instrument Men are represented in displayed crews.' : 'All available personnel have a proposed or confirmed crew assignment.'}</p>}</div></section>
      {organization && <section className="org-available" aria-label="Named organizational teams"><h2>Named Teams</h2><p className="org-empty">Membership and team Area coverage do not establish reporting links or individual operational authority.</p>{organization.teams.map(team => <details key={team.id}><summary>{team.name} · Lead: {team.lead.name}{team.lead.active ? '' : ' (inactive access)'}</summary><p>Team Areas: {team.areas?.map(area => area.name).join(', ') || 'none recorded'}</p><p>Members: {team.members.map(member => `${member.name} (${member.role.replaceAll('_', ' ')}${member.active ? '' : ', inactive access'})`).join('; ') || 'none'}</p></details>)}{!organization.teams.length && <p>No active named teams.</p>}</section>}
      <footer className="org-legend">{editable ? 'Visual selections use existing governed Team Management reviews; memberships, reporting, Areas and request history remain distinct.' : readOnly ? 'Explicit reporting links · Explicit crew rosters · Read-only project snapshot' : <>Instrument Man → Party Chief <span>·</span> Party Chief + crew → Superintendent <span>·</span> Every move requires review</>}</footer>
    </div>
    {choosingId && subject && <AdministrationDialog title={subject.role === 'Party Chief' ? 'Choose a Crew Destination' : 'Choose a Party Chief'} locked={false} onDismiss={cancel}>
      <p><strong>{subject.name}</strong>{subject.role === 'Party Chief' && ` + ${crewSize(subject.id)} Instrument Men`}</p><p className="muted">From: {parentLabel(subject)}</p>
      <div className="org-destinations">{people.filter(p => supportedMove(subject, p)).map(target => <Button key={target.id} variant="secondary" onClick={() => propose(subject, target)}>{target.name} · {target.team ?? target.area}</Button>)}</div>
      <Button variant="secondary" onClick={cancel}>Cancel</Button>
    </AdministrationDialog>}
    {!onPropose && proposal && subject && destination && <AdministrationDialog title={subject.role === 'Party Chief' ? 'Review Crew Move' : 'Review Manpower Move'} locked={false} onDismiss={cancel}>
      <p className="org-review-person"><strong>{subject.name}</strong><span>{subject.role}{subject.role === 'Party Chief' ? ` · ${crewSize(subject.id)} Instrument Men move together` : ''}</span></p>
      <dl className="org-review-facts"><dt>From</dt><dd>{parentLabel(subject)}</dd><dt>To</dt><dd>{destination.name}{destination.team ? ` / ${destination.team}` : ''}</dd><dt>Proposed Area</dt><dd>{destination.area}</dd><dt>Existing request assignments</dt><dd>Retained</dd><dt>Historical request records</dt><dd>Unchanged</dd></dl>
      {subject.role === 'Party Chief' && <p>Crew included: {children(subject.id, people).map(p => p.name).join(', ') || 'No Instrument Men'}.</p>}
      <p className="org-review-note">Proposed placement is shown behind this review. Cancel restores the prior hierarchy. Confirm updates this mock chart only.</p>
      <div className="row"><Button variant="secondary" onClick={cancel}>Cancel</Button><Button onClick={() => { setPeople(projectMove(people, proposal)); setProposal(null); setNotice(`${subject.name}${subject.role === 'Party Chief' ? ' and crew' : ''} moved to ${destination.name}. Local demo only.`); }}>Confirm Move</Button></div>
    </AdministrationDialog>}
  </main>;
}
