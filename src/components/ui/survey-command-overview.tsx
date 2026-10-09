'use client';
import {HeadingHelp} from '@/components/ui/heading-help';
import { TICKET_TYPE_LABELS } from '@/lib/display-labels';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { commandReviewHref, type CommandFilters } from '@/lib/survey-command-view';
import { operationsStatusLabel } from '@/lib/operations-view';
import type { AmeliaMetrics, MetricBucket } from '@/modules/reporting/application/amelia-metrics';
import type { CommandActivity } from '@/modules/reporting/application/command-activity';
import { KpiChart, KpiComparisonTrend } from './kpi-charts';
import { Button } from './button';
import './kpi-explorer.css';
import './survey-command-overview.css';

type Distribution = 'areas' | 'types' | 'crews';
const typeLabels: Record<string, string> = TICKET_TYPE_LABELS;
const dimensions = ['areaId', 'ticketType', 'status', 'crewId'] as const;

export function SurveyCommandOverview({ projectId, initialMetrics, revision }: {
  projectId: string; initialMetrics: AmeliaMetrics; revision: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CommandFilters>({});
  const [applied, setApplied] = useState<CommandFilters>({});
  const [distribution, setDistribution] = useState<Distribution>('areas');
  const [retry, setRetry] = useState(0);
  const [chartSnapshot, setChartSnapshot] = useState<{ key: string; metrics?: AmeliaMetrics; error?: string }>();
  const [activitySnapshot, setActivitySnapshot] = useState<{ key: string; activity?: CommandActivity; error?: string }>();
  const appliedKey = JSON.stringify(applied);
  const chartFilters = useMemo(() => Object.fromEntries(dimensions.filter(dimension => applied[dimension]).map(dimension => [dimension, applied[dimension]])),
    [applied.areaId, applied.ticketType, applied.status, applied.crewId]);
  const chartKey = JSON.stringify([projectId, chartFilters, revision, retry]);
  const activityKey = JSON.stringify([projectId, appliedKey, revision, retry]);
  const chartResult = chartSnapshot?.key === chartKey ? chartSnapshot : undefined;
  const activityResult = activitySnapshot?.key === activityKey ? activitySnapshot : undefined;
  const current = chartResult?.metrics && activityResult?.activity ? { metrics: chartResult.metrics, activity: activityResult.activity } : undefined;
  const error = chartResult?.error ?? activityResult?.error;
  const baseCharts = initialMetrics.charts;

  useEffect(() => {
    if (!baseCharts) return;
    let active = true;
    const hasDimension = Object.keys(chartFilters).length > 0;
    const charts = hasDimension ? apiClient.getKpiCharts(projectId, chartFilters).then(result => result.metrics) : Promise.resolve(initialMetrics);
    charts.then(metrics => {
      if (active) setChartSnapshot({ key: chartKey, metrics });
    }).catch(error => {
      if (active) setChartSnapshot({ key: chartKey, error: getErrorMessage(error, 'Unable to load Survey command charts.') });
    });
    return () => { active = false; };
  }, [projectId, chartFilters, chartKey, initialMetrics, baseCharts]);
  useEffect(() => {
    let active = true;
    apiClient.getCommandActivity(projectId, applied).then(result => {
      if (active) setActivitySnapshot({ key: activityKey, activity: result.activity });
    }).catch(error => {
      if (active) setActivitySnapshot({ key: activityKey, error: getErrorMessage(error, 'Unable to load Survey command activity.') });
    });
    return () => { active = false; };
  }, [projectId, appliedKey, activityKey]);

  const set = (field: keyof CommandFilters, value: string) => setDraft(previous => ({ ...previous, [field]: value || undefined }));
  const apply = () => setApplied(Object.fromEntries(Object.entries(draft).filter(([, value]) => value)) as CommandFilters);
  const reset = () => { setDraft({}); setApplied({}); };
  const drill = (selected: Parameters<typeof commandReviewHref>[2] = {}) => router.push(commandReviewHref(projectId, applied, selected));
  const chart = current?.metrics.charts;
  const total = current?.metrics?.total ?? 0;
  const rows: Record<Distribution, MetricBucket[]> = chart ? {
    areas: chart.areas.filter(row => row.key !== '__unassigned__'),
    types: chart.types.map(row => ({ ...row, label: typeLabels[row.label] ?? row.label })),
    crews: chart.crews.filter(row => row.key !== '__unassigned__'),
  } : { areas: [], types: [], crews: [] };
  const group = rows[distribution];
  const groupTitle = distribution === 'areas' ? 'Area' : distribution === 'types' ? 'Request Type' : 'Party Chief';
  const selectGroup = (value: string) => drill(distribution === 'areas' ? { areaId: value } : distribution === 'types' ? { ticketType: value as CommandFilters['ticketType'] } : { crewId: value });
  const scoped = Object.entries(applied).filter(([field, value]) => value && !['dateFrom', 'dateTo'].includes(field));

  return <section className="ops-command" aria-label="Survey command overview" aria-busy={!current && !error}>
    <div className="ops-command-heading"><div><HeadingHelp label={"Survey Command"} heading={<h2>Survey Command</h2>} help={<span>Current request state and recorded activity within your authorized project scope.</span>}/></div><span>Survey Manager view</span></div>
    <form className="ops-command-filters" onSubmit={event => { event.preventDefault(); apply(); }}>
      <label>Area<select value={draft.areaId ?? ''} onChange={event => set('areaId', event.target.value)}><option value="">All authorized Areas</option>{baseCharts?.facets.areas.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <label>Request type<select value={draft.ticketType ?? ''} onChange={event => set('ticketType', event.target.value)}><option value="">All types</option>{baseCharts?.types.filter(row => row.key !== '__unassigned__').map(row => <option key={row.key} value={row.key}>{typeLabels[row.label] ?? row.label}</option>)}</select></label>
      <label>Party Chief<select value={draft.crewId ?? ''} onChange={event => set('crewId', event.target.value)}><option value="">All authorized crews</option>{baseCharts?.facets.crews.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <details className="ops-command-more"><summary>More Filters and Activity Dates</summary><div>
        <label>Current status<select value={draft.status ?? ''} onChange={event => set('status', event.target.value)}><option value="">All statuses</option>{baseCharts?.statuses.map(row => <option key={row.key} value={row.key}>{operationsStatusLabel(row.key)}</option>)}</select></label>
        <label>Activity from · UTC<input type="date" value={draft.dateFrom ?? ''} onChange={event => set('dateFrom', event.target.value)} /></label>
        <label>Activity through · UTC<input type="date" value={draft.dateTo ?? ''} onChange={event => set('dateTo', event.target.value)} /></label>
        <HeadingHelp label="Activity Dates" heading={<h4>Activity Dates</h4>} help="Dates narrow the activity chart only. Current-state counts retain older open work. Activity windows are limited to 90 days." />
      </div></details>
      <div className="ops-command-actions"><Button type="submit">Apply</Button><Button type="button" variant="secondary" onClick={reset}>Reset</Button></div>
    </form>
    {scoped.length ? <p className="ops-command-scope">Applied request scope: {scoped.map(([field, value]) => field === 'areaId' ? baseCharts?.facets.areas.find(row => row.key === value)?.label ?? 'Area' : field === 'crewId' ? baseCharts?.facets.crews.find(row => row.key === value)?.label ?? 'Party Chief' : field === 'status' ? operationsStatusLabel(value!) : typeLabels[value!] ?? value).join(' · ')}</p> : null}
    {!current && !error ? <div className="ops-command-loading" role="status"><span>Loading command overview…</span><div /><div /></div> : null}
    {error ? <div className="ops-command-error"><p role="alert">{error}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry overview</Button></div> : null}
    {current && chart ? <>
      <div className="ops-command-grid">
        <section className="ops-command-panel"><div className="ops-command-panel-heading"><HeadingHelp label="Current Status" heading={<h3>Current Status</h3>} help="All dates · current status, not event history" /><button type="button" className="app-link" onClick={() => drill()}>Review {total.toLocaleString()} requests</button></div>
          {total ? <KpiChart kind="donut" rows={chart.statuses.map(row => ({ ...row, label: operationsStatusLabel(row.key) }))} months={[]} cells={[]} cycle={false} total={total} denominator={total} title="Current status" select={value => drill({ status: value as CommandFilters['status'] })} selectMonth={() => {}} /> : <p className="muted">No requests match this scope. Reset filters to inspect the project.</p>}
        </section>
        <section className="ops-command-panel"><HeadingHelp label="Demand and Recorded Completion" heading={<h3>Demand and Recorded Completion</h3>} help={`${current.activity.from} through ${current.activity.to} · first submissions vs. recorded completions · UTC`} />
          <KpiComparisonTrend points={current.activity.days.map(day => ({ key: day.date, primary: day.submitted, secondary: day.recordedCompletions }))} title="Daily request activity" primaryLabel="Submitted" secondaryLabel="Recorded completed" />
          {current.activity.excludedSyntheticCompletions ? <p className="ops-command-note">{current.activity.excludedSyntheticCompletions.toLocaleString()} generated completion dates excluded from this window.</p> : null}
        </section>
      </div>
        <div className="ops-command-distribution"><div className="ops-command-panel-heading"><div><HeadingHelp label={"Request Distribution"} heading={<h3>Request Distribution</h3>} help={<span>Current requests · all dates · select a bar to review matching requests. Unassigned requests are included in current status but are not attributed to a Party Chief. Assignment timing and employee productivity are not inferred from these counts.</span>}/></div><div className="ops-command-switch" role="group" aria-label="Distribution dimension">{(['areas', 'types', 'crews'] as const).map(value => <button key={value} type="button" aria-pressed={distribution === value} onClick={() => setDistribution(value)}>{value === 'areas' ? 'Area' : value === 'types' ? 'Type' : 'Party Chief'}</button>)}</div></div>
        {group.length ? <KpiChart kind="bar" rows={group} months={[]} cells={[]} cycle={false} total={total} denominator={total} title={`Requests by ${groupTitle}`} select={selectGroup} selectMonth={() => {}} /> : <p className="muted">No {groupTitle.toLowerCase()} assignments in this scope. Try another dimension or reset filters.</p>}
        {chart.limits.truncated ? <p className="ops-command-note">Breakdowns show at most {chart.limits.groups} groups. Totals remain complete; narrow the scope to inspect omitted groups.</p> : null}
      </div>
    </> : null}
  </section>;
}
