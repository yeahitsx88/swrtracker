'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

function HomeRequests({ projectId, tickets, title, total, requester, drafts = false }: {
  projectId: string; tickets: TicketRecord[]; title: string; total: number; requester: boolean; drafts?: boolean;
}) {
  return tickets.length ? <div className="home-records"><p className="home-record-scope">{tickets.length} of {total.toLocaleString()} authorized {drafts ? 'drafts' : 'requests'} · filter and export these loaded records</p><AdministrationRecords compact label={title} rows={tickets} id={row => row.id} columns={[
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
  const [linkedOpen, setLinkedOpen] = useState(false);
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
  const stat = (label: string, value: number, icon: IconName, href: string, note?: string) => <Link className="home-stat" href={href}><Icon name={icon} size={24} /><span><strong>{value.toLocaleString()}</strong><span>{label}</span>{note && <small>{note}</small>}</span><Icon name="chevron" size={16} /></Link>;
  const statusPanel = data && (<Card title="Request status" description="All dates · current state" className="home-status">{chart?.statuses.length ? <KpiChart kind="donut" rows={chart.statuses.map(row => ({...row, label: operationsStatusLabel(row.key)}))} months={[]} cells={[]} cycle={false} total={data.metrics.total ?? 0} denominator={data.metrics.total ?? 0} title="Request status" select={value => drill({status: value})} selectMonth={() => {}} /> : <p className="home-empty">No submitted requests in your current scope.</p>}</Card>);
  const upcomingPanel = data && (<Card className="home-upcoming" title="Upcoming Need-By dates" description={`${data.dates.today} through ${data.dates.through} · open requests only`}><HomeRequests projectId={projectId} tickets={data.upcoming.data} title="upcoming requests" total={data.upcoming.total} requester={requester} /></Card>);
  const areaPanel = data && (!requester && !field && 'areas' in (chart ?? {}) && <Card className="home-area" title="Requests by Area" description="Current requests · all dates · authorized Areas"><KpiChart kind="bar" rows={('areas' in chart! ? chart.areas : []).slice(0,8)} months={[]} cells={[]} cycle={false} total={data.metrics.total ?? 0} denominator={data.metrics.total ?? 0} title="Requests by Area" select={value => drill({areaId: value})} selectMonth={() => {}} /><p className="muted">Up to eight Areas shown. Summary totals cover your complete authorized scope.</p></Card>);
  return <div className="home-workspace">
    <header className="home-heading"><div><h1>{name ? `Welcome, ${name}` : 'Home'}</h1><p>{operational ? title : 'Your project workspace'}</p></div><div className="home-heading-actions"><span className="home-date">{data?.dates.today ?? new Date().toISOString().slice(0,10)} · UTC</span><button className="button button-secondary" type="button" onClick={() => setRevision(value => value + 1)}><Icon name="refresh" />Refresh Home</button></div></header>
    {nameError && <p className="error-banner" role="alert">{nameError}</p>}
    {requester && status === 'ACTIVE' && <Link className="home-primary-action" href={`${base}/request/new`}><Icon name="plus" size={28} /><span><strong>Submit a new survey request</strong><span>Provide the Area, Need-By date, contact and work details.</span></span><Icon name="chevron" /></Link>}
    {operational && <p className="home-scope">{requester ? 'Your requests and company requests you’re authorized to follow.' : superintendent ? `All work within your Areas, including unassigned work.${caps?.canAdminister ? '' : ' Linked-crew reporting is separate below.'}` : field ? 'Work and history available to your crew and assignments.' : 'Current request state within your project access. Request counts are not productivity measures.'} Counts include all dates; upcoming dates use UTC.</p>}
    {operational && !current && <p className="muted" role="status">Loading authorized requests and dashboard…</p>}
    {current?.error && <section className="panel"><p className="error-banner" role="alert">{current.error}</p><button className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Retry Home</button></section>}
    {data && <>
      <div className="home-stats">
        {stat('Open requests', data.open, 'file', `${requestHref}?queue=open&view=requests`)}
        {stat(requester ? 'Awaiting review' : role === 'PARTY_CHIEF' ? 'Field reports to review' : field ? 'In progress' : 'Awaiting review', field && role !== 'PARTY_CHIEF' ? data.inProgress : data.awaiting, field ? 'crew' : 'clock', role === 'PARTY_CHIEF' ? `${base}/crew/approvals` : `${requestHref}?queue=all&view=requests&status=${field ? 'IN_PROGRESS' : 'SUBMITTED'}`)}
        {stat('Due soon', data.upcoming.total, 'calendar', `${requestHref}?queue=open&view=requests&dateBasis=needBy&dateFrom=${data.dates.today}&dateTo=${data.dates.through}`, 'Today through +3 days')}
        {stat('Completed', data.completed, 'check', `${requestHref}?queue=completed&view=requests`, 'All dates')}
      </div>
      <div className="home-dashboard-grid" data-audience={manager || superintendent ? 'survey' : requester ? 'requester' : 'field'}>
        {(manager || superintendent) && areaPanel}
        <Card title={field ? 'Recent crew requests' : 'Recent requests'} actions={<Link className="text-link" href={requestHref}>View all requests</Link>} className="home-recent"><HomeRequests projectId={projectId} tickets={data.recent.data} title="recent requests" total={data.recent.total} requester={requester} /></Card>


        {!(manager || superintendent) && statusPanel}
        {!(manager || superintendent) && upcomingPanel}
        {requester ? <Card title="Saved drafts" actions={<Link className="text-link" href={`${base}/drafts`}>View drafts</Link>}><HomeRequests projectId={projectId} tickets={data.drafts?.data ?? []} title="saved drafts" total={data.drafts?.total ?? 0} requester drafts /></Card> : <Card className="home-health-panel" title={field ? 'Work obligations' : 'Queue health'}>
          <dl className="home-health"><div><dt>In progress</dt><dd>{data.inProgress.toLocaleString()}</dd></div><div><dt>Overdue Need-By</dt><dd>{data.overdue.toLocaleString()}</dd></div><div><dt>Open requests</dt><dd>{data.open.toLocaleString()}</dd></div></dl>
          <Link className="button button-secondary" href={field ? `${base}/crew/work` : manager || superintendent && !caps?.canAdminister ? `${base}/survey/operations` : `${base}/requests`}>{field ? 'Open Crew Work' : manager || superintendent && !caps?.canAdminister ? 'Open Survey Operations' : 'Open Project Review'}</Link>
          {role === 'PARTY_CHIEF' && <Link className="text-link" href={`${base}/crew/approvals`}>Review field reports</Link>}
        </Card>}

        {manager && 'crews' in (chart ?? {}) && <Card className="home-crew" title="Crew request distribution" description="Assigned Party Chief · current requests · all dates"><KpiChart kind="bar" rows={('crews' in chart! ? chart.crews : []).filter(row => row.key !== '__unassigned__').slice(0,8)} months={[]} cells={[]} cycle={false} total={data.metrics.total ?? 0} denominator={data.metrics.total ?? 0} title="Crew request distribution" select={value => drill({crewId: value})} selectMonth={() => {}} /><p className="muted">Up to eight crews. Unassigned requests are not attributed to a crew; counts are not productivity measures.</p></Card>}
        {(manager || superintendent) && upcomingPanel}
        {(manager || superintendent) && statusPanel}
        {!(manager || superintendent) && areaPanel}
      </div>
      {(requester || field) && !caps?.canAdminister && <ScopedKpiEntry projectId={projectId} audience={requester ? 'requester' : 'field'} />}
      {superintendent && !caps?.canAdminister && <details className="home-linked-crew" onToggle={event => setLinkedOpen(event.currentTarget.open)}><summary>Linked-crew KPIs</summary><p>Only explicitly linked crews within your authorized Areas. Area overlap does not establish a reporting relationship.</p>{linkedOpen && <KpiExplorer projectId={projectId} initialMeasure="open" fixedFilters={{cohort: 'linkedCrews'}} />}</details>}
    </>}
    {(!operational || caps?.canAdminister) && <Card title={caps?.canAdminister ? 'Project administration' : 'Project setup'} description={caps?.canAdminister ? 'Your independent administrative capability remains separate from operational work.' : 'Ordinary workflow is restricted in this project state.'}>{caps?.canAdminister && <Link className="button" href={`${base}/admin`}>Open Project Administration</Link>}<Link className="text-link" href="/projects">Return to Projects</Link></Card>}
  </div>;
}

