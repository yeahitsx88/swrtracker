'use client';
import { HomeWidgets } from './home-widgets';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { operationsStatusLabel } from '@/lib/operations-view';
import { ticketTypeLabel } from '@/lib/display-labels';
import { loadProjectHome, type ProjectHomeData } from '@/lib/project-home-data';
import type { TicketRecord } from '@/lib/contracts/tickets';
import { useProjectWorkspace } from './project-shell-header';
import { AdministrationRecords } from './administration-records';
import { Card } from './card';
import { Icon, type IconName } from './icon';
import { StatusBadge } from './status-badge';
import { KpiChart } from './kpi-charts';
import { ScopedKpiEntry } from './scoped-kpi-entry';
import { KpiExplorer } from './kpi-explorer';
import './kpi-explorer.css';
import './project-home.css';
import {HeadingHelp,HelpHint} from './heading-help';
import {headingCase} from '@/lib/heading-case';

const recordScope = (loaded:number,total:number,drafts=false) => `${loaded} of ${total.toLocaleString()} authorized ${drafts?'drafts':'requests'} · filter and export these loaded records${loaded?' · Scroll the table sideways to see every column and action.':''}`;

function LinkedCrew({projectId}:{projectId:string}) {
  const label=useRef<HTMLSpanElement>(null);
  const [open,setOpen]=useState(false),[helpLeft,setHelpLeft]=useState(0);
  useLayoutEffect(()=>{
    const node=label.current;if(!node)return;
    const measure=()=>setHelpLeft(node.offsetLeft+node.offsetWidth+4);
    const observer=new ResizeObserver(measure);observer.observe(node);measure();
    return()=>observer.disconnect();
  },[]);
  return <div className="home-linked-crew-wrap" style={{'--linked-help-left':`${helpLeft}px`} as CSSProperties}><HelpHint label="Linked-Crew KPIs">Only explicitly linked crews within your authorized Areas. Area overlap does not establish a reporting relationship.</HelpHint><details className="home-linked-crew" onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}><summary><span ref={label}>Linked-Crew KPIs</span></summary>{open&&<KpiExplorer projectId={projectId} initialMeasure="open" fixedFilters={{cohort:'linkedCrews'}}/>}</details></div>;
}

function HomeRequests({ projectId, tickets, title, requester, drafts = false }: {
  projectId: string; tickets: TicketRecord[]; title: string; requester: boolean; drafts?: boolean;
}) {
  return tickets.length ? <div className="home-records"><AdministrationRecords compact label={title} rows={tickets} id={row => row.id} columns={[
    {key: 'reference', className: 'home-reference-column', label: drafts ? 'Draft' : 'Request', text: row => row.ticketNumber ?? 'Unnumbered draft', render: row => <Link className="text-link" href={drafts ? `/projects/${projectId}/request/new?draft=${row.id}` : `/projects/${projectId}/tickets/${row.id}`}>{row.ticketNumber ?? 'Resume draft'}</Link>},
    {key: 'details', label: 'Details', text: row => row.description || 'Partial draft', render: row => <span className="home-request-details">{row.description || 'Partial draft'}<small>{ticketTypeLabel(row.ticketType)}</small></span>},
    ...(!drafts ? [{key: 'status', className: 'home-status-column', label: 'Status', text: (row: TicketRecord) => operationsStatusLabel(row.status), render: (row: TicketRecord) => <StatusBadge status={row.status} viewerIsRequester={requester} />}] : []),
    {key: 'needBy', className: 'home-date-column', label: drafts ? 'Last saved' : 'Need-By', text: row => drafts ? (row.draftLastSavedAt ?? row.updatedAt).slice(0,10) : row.requestedDate?.slice(0,10) ?? 'Not set'},
  ]} /></div> : <p className="home-empty">{drafts ? 'No saved drafts. Start a new request and save your progress at any point.' : 'No requests in this view. Work will appear here as it enters your authorized scope.'}</p>;
}

export function ProjectHome() {
  const workspace = useProjectWorkspace();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const [snapshot, setSnapshot] = useState<{key: string; data?: ProjectHomeData; error?: string}>();
  const projectId = workspace?.project.id ?? '';
  const caps = workspace?.capabilities;
  const role = caps?.operationalRole;
  const status = workspace?.project.status;
  const operational = !!role && role !== 'PROJECT_ADMIN' && !caps?.accessDisabled && status !== 'SETUP';
  const requester = role === 'REQUESTER';
  const manager = role === 'SURVEY_MANAGER';
  const superintendent = role === 'SURVEY_SUPERINTENDENT';
  const field = role === 'PARTY_CHIEF' || role === 'INSTRUMENT_MAN';
  const key = JSON.stringify([projectId, caps, status, revision]);
  const current = snapshot?.key === key ? snapshot : undefined;
  useEffect(() => {
    let active = true;
    setName(undefined); setNameError(undefined);
    apiClient.getMyAccount(projectId).then(account => { if (active) setName(account.name); })
      .catch(error => { if (active) setNameError(getErrorMessage(error, 'Unable to load your account greeting.')); });
    return () => { active = false; };
  }, [projectId, revision]);
  useEffect(() => {
    if (!operational || !caps) return;
    let active = true;
    loadProjectHome(projectId, caps).then(data => { if (active) setSnapshot({key, data}); })
      .catch(error => { if (active) setSnapshot({key, error: getErrorMessage(error, 'Unable to load your Home. Refresh to check current access and try again.')}); });
    return () => { active = false; };
  }, [key, operational]);
  if (!workspace) return null;
  const base = `/projects/${projectId}`;
  const requestHref = requester ? `${base}/my-requests` : field ? `${base}/crew/work` : `${base}/requests`;
  const title = requester ? 'Your requests, at a glance' : manager ? 'Survey work, at a glance' : superintendent ? 'Your Areas, at a glance' : field ? 'Your field work, at a glance' : 'Project review, at a glance';
  const data = current?.data;
  const chart = data?.metrics.charts;
  function drill(selection: Record<string,string>) {
    const query = new URLSearchParams({queue: 'all', ...(!requester && !field ? {view: 'requests'} : {}), ...selection});
    // Existing request pages retain their routes; Project Review already supports linked filters.
    router.push(`${requestHref}?${query}`);
  }
  const stat = (label: string, value: number, icon: IconName, href: string, note?: string) => <div className="home-stat-cell"><Link className="home-stat" href={href}><Icon name={icon} size={24} /><span><strong>{value.toLocaleString()}</strong><span>{headingCase(label)}</span></span><Icon name="chevron" size={16} /></Link>{note&&<HelpHint label={headingCase(label)}>{note}</HelpHint>}</div>;
  const statusPanel = data && (<Card title="Request Status" description="All dates · current state" className="home-status">{chart?.statuses.length ? <KpiChart kind="donut" rows={chart.statuses.map(row => ({...row, label: operationsStatusLabel(row.key)}))} months={[]} cells={[]} cycle={false} total={data.metrics.total ?? 0} denominator={data.metrics.total ?? 0} title="Request status" select={value => drill({status: value})} selectMonth={() => {}} /> : <p className="home-empty">No submitted requests in your current scope.</p>}</Card>);
  const upcomingPanel = data && (<Card className="home-upcoming" title="Upcoming Need-By Dates" description={`${data.dates.today} through ${data.dates.through} · open requests only. ${recordScope(data.upcoming.data.length,data.upcoming.total)}`}><HomeRequests projectId={projectId} tickets={data.upcoming.data} title="upcoming requests" requester={requester} /></Card>);
  const areaPanel = data && (!requester && !field && 'areas' in (chart ?? {}) && <Card className="home-area" title="Requests by Area" description="Current requests · all dates · authorized Areas. Up to eight Areas shown. Summary totals cover your complete authorized scope."><KpiChart kind="bar" rows={('areas' in chart! ? chart.areas : []).slice(0,8)} months={[]} cells={[]} cycle={false} total={data.metrics.total ?? 0} denominator={data.metrics.total ?? 0} title="Requests by Area" select={value => drill({areaId: value})} selectMonth={() => {}} /></Card>);
  return <div className="home-workspace">
    <header className="home-heading"><HeadingHelp label="Home" heading={<h1>{name ? `Welcome, ${name}` : 'Home'}</h1>} help={<><p>{operational ? title : 'Your project workspace'}</p>{operational&&<p>{requester ? 'Your requests and company requests you’re authorized to follow.' : superintendent ? `All work within your Areas, including unassigned work.${caps?.canAdminister ? '' : ' Linked-crew reporting is separate below.'}` : field ? 'Work and history available to your crew and assignments.' : 'Current request state within your project access. Request counts are not productivity measures.'} Counts include all dates; upcoming dates use UTC.</p>}</>}/><div className="home-heading-actions"><span className="home-date">{data?.dates.today ?? new Date().toISOString().slice(0,10)} · UTC</span><button className="button button-secondary" type="button" onClick={() => setRevision(value => value + 1)}><Icon name="refresh" />Refresh Home</button></div></header>
    {nameError && <p className="error-banner" role="alert">{nameError}</p>}
    {requester && status === 'ACTIVE' && <div className="home-primary-action"><Icon name="plus" size={28}/><HeadingHelp label="Submit a New Survey Request" heading={<Link className="home-primary-link" href={`${base}/request/new`}><strong>Submit a New Survey Request</strong></Link>} help="Provide the Area, Need-By date, contact and work details."/><Icon name="chevron"/></div>}
    {operational && !current && <p className="muted" role="status">Loading authorized requests and dashboard…</p>}
    {current?.error && <section className="panel"><p className="error-banner" role="alert">{current.error}</p><button className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Retry Home</button></section>}
    {data && <>
      <div className="home-stats">
        {stat('Open requests', data.open, 'file', `${requestHref}?queue=open&view=requests`)}
        {stat(requester ? 'Awaiting review' : role === 'PARTY_CHIEF' ? 'Field reports to review' : field ? 'In progress' : 'Awaiting review', field && role !== 'PARTY_CHIEF' ? data.inProgress : data.awaiting, field ? 'crew' : 'clock', role === 'PARTY_CHIEF' ? `${base}/crew/approvals` : `${requestHref}?queue=all&view=requests&status=${field ? 'IN_PROGRESS' : 'SUBMITTED'}`)}
        {stat('Due soon', data.upcoming.total, 'calendar', `${requestHref}?queue=open&view=requests&dateBasis=needBy&dateFrom=${data.dates.today}&dateTo=${data.dates.through}`, 'Today through +3 days')}
        {stat('Completed', data.completed, 'check', `${requestHref}?queue=completed&view=requests`, 'All dates')}
      </div>
      <HomeWidgets storageKey={`${projectId}:${role}`} audience={manager || superintendent ? 'survey' : 'other'}>
        {(manager || superintendent) && areaPanel}
        <Card title={field ? 'Recent Crew Requests' : 'Recent Requests'} description={recordScope(data.recent.data.length,data.recent.total)} actions={<Link className="text-link" href={requestHref}>View all requests</Link>} className="home-recent"><HomeRequests projectId={projectId} tickets={data.recent.data} title="recent requests" requester={requester} /></Card>


        {!(manager || superintendent) && statusPanel}
        {!(manager || superintendent) && upcomingPanel}
        {requester ? <Card title="Saved Drafts" description={recordScope(data.drafts?.data.length??0,data.drafts?.total??0,true)} actions={<Link className="text-link" href={`${base}/drafts`}>View drafts</Link>}><HomeRequests projectId={projectId} tickets={data.drafts?.data ?? []} title="saved drafts" requester drafts /></Card> : <Card className="home-health-panel" title={field ? 'Work Obligations' : 'Queue Health'}>
          <dl className="home-health"><div><dt>In Progress</dt><dd>{data.inProgress.toLocaleString()}</dd></div><div><dt>Overdue Need-By</dt><dd>{data.overdue.toLocaleString()}</dd></div><div><dt>Open Requests</dt><dd>{data.open.toLocaleString()}</dd></div></dl>
          <Link className="button button-secondary" href={field ? `${base}/crew/work` : manager || superintendent && !caps?.canAdminister ? `${base}/survey/operations` : `${base}/requests`}>{field ? 'Open Crew Work' : manager || superintendent && !caps?.canAdminister ? 'Open Survey Operations' : 'Open Project Review'}</Link>
          {role === 'PARTY_CHIEF' && <Link className="text-link" href={`${base}/crew/approvals`}>Review field reports</Link>}
        </Card>}

        {manager && 'crews' in (chart ?? {}) && <Card className="home-crew" title="Crew Request Distribution" description="Assigned Party Chief · current requests · all dates. Up to eight crews. Unassigned requests are not attributed to a crew; counts are not productivity measures."><KpiChart kind="bar" rows={('crews' in chart! ? chart.crews : []).filter(row => row.key !== '__unassigned__').slice(0,8)} months={[]} cells={[]} cycle={false} total={data.metrics.total ?? 0} denominator={data.metrics.total ?? 0} title="Crew request distribution" select={value => drill({crewId: value})} selectMonth={() => {}} /></Card>}
        {(manager || superintendent) && upcomingPanel}
        {(manager || superintendent) && statusPanel}
        {!(manager || superintendent) && areaPanel}
      </HomeWidgets>
      {(requester || field) && !caps?.canAdminister && <ScopedKpiEntry projectId={projectId} audience={requester ? 'requester' : 'field'} />}
      {superintendent && !caps?.canAdminister && <LinkedCrew projectId={projectId}/> }
    </>}
    {(!operational || caps?.canAdminister) && <Card title={caps?.canAdminister ? 'Project Administration' : 'Project Setup'} description={caps?.canAdminister ? 'Your independent administrative capability remains separate from operational work.' : 'Ordinary workflow is restricted in this project state.'}>{caps?.canAdminister && <Link className="button" href={`${base}/admin`}>Open Project Administration</Link>}<Link className="text-link" href="/projects">Return to Projects</Link></Card>}
  </div>;
}

