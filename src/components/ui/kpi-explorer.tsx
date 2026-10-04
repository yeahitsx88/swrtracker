'use client';
import {RecordCollection} from '@/components/ui/record-collection';
import { TICKET_TYPE_LABELS } from '@/lib/display-labels';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { operationsStatusLabel } from '@/lib/operations-view';
import { useTicketPage } from '@/lib/use-ticket-page';
import type { MetricsFilters } from '@/modules/reporting/application/metrics-filters';
import { KpiChart, chartNames, type ChartKind } from './kpi-charts';
import { Button } from './button';
import './kpi-explorer.css';
import {HeadingHelp} from './heading-help';

export type KpiMeasure='all'|'open'|'assignment'|'overdue'|'completed'|'cycle';
export type KpiAudience='operations'|'requester'|'field';
const titles:Record<KpiMeasure,string>={all:'All Requests',open:'Open Requests',assignment:'Need Assignment',overdue:'Overdue Need-By',completed:'Completed Requests',cycle:'Average Turnaround'};
const measures:Record<KpiAudience,readonly KpiMeasure[]>={operations:['all','open','assignment','overdue','completed','cycle'],requester:['all','open','completed','cycle'],field:['all','open','overdue','completed','cycle']};
const typeNames:Record<string,string>=TICKET_TYPE_LABELS;
type Group='areas'|'types'|'statuses'|'crews'|'instrumentMen';
const groups:Record<Group,string>={areas:'Area',types:'Request type',statuses:'Status',crews:'Party Chief / crew',instrumentMen:'Assigned Instrument Man'};
const groupFilter:Record<Group,keyof MetricsFilters>={areas:'areaId',types:'ticketType',statuses:'status',crews:'crewId',instrumentMen:'instrumentManId'};
type Result=Awaited<ReturnType<typeof apiClient.getKpiCharts>>;
const defaults=(metric:KpiMeasure,cohort?:MetricsFilters['cohort']):MetricsFilters=>({population:metric==='cycle'?'completed':metric,dateBasis:metric==='cycle'?'completed':'needBy',...(cohort?{cohort}:{})});

export function KpiExplorer({projectId,initialMeasure,audience='operations',initialData,memberId,fixedFilters={}}:{projectId:string;initialMeasure:KpiMeasure;audience?:KpiAudience;initialData?:Result;memberId?:string;fixedFilters?:MetricsFilters}) {
  const [measure,setMeasure]=useState(initialMeasure);
  const [kind,setKind]=useState<ChartKind>(audience==='requester'?'donut':initialMeasure==='open'?'heat':'bar');
  const [group,setGroup]=useState<Group>(audience==='requester'?'statuses':'areas');
  const [filters,setFilters]=useState<MetricsFilters>({...defaults(initialMeasure),...fixedFilters});
  const [draft,setDraft]=useState(filters);
  const [revision,setRevision]=useState(0);
  const key=JSON.stringify({projectId,filters,revision,memberId});
  const [snapshot,setSnapshot]=useState<{key:string;data?:Result;error?:string}|undefined>(()=>initialData?{key,data:initialData}:undefined);
  const seedKey=useRef(initialData?key:null);
  const authority=useRef({projectId,linked:initialData?.analytics.supportsLinkedCrewScope===true});
  const [details,setDetails]=useState(false);
  const [page,setPage]=useState(1); const [size,setSize]=useState(10);
  useEffect(()=>{ let active=true; const input=JSON.parse(key) as {projectId:string;filters:MetricsFilters;memberId?:string};
    if(seedKey.current===key){seedKey.current=null;return;}
    seedKey.current=null;
    apiClient.getKpiCharts(input.projectId,input.filters,input.memberId).then(data=>{if(active){authority.current={projectId:input.projectId,linked:data.analytics.supportsLinkedCrewScope===true};setSnapshot({key,data});}})
      .catch(error=>{if(active)setSnapshot({key,error:getErrorMessage(error,'Unable to load analytics. Retry the request.')});});
    return()=>{active=false;};
  },[key]);
  const current=snapshot?.key===key?snapshot:undefined;
  const result=current?.data; const metrics=result?.metrics; const charts=metrics?.charts;
  const superintendent=!memberId&&authority.current.projectId===projectId&&authority.current.linked;
  const linked=filters.cohort==='linkedCrews';
  const {population,...rest}=filters;
  const request=useTicketPage(projectId,page,size,{...rest,queue:population??'all'},details&&!!metrics,revision);
  const pages=Math.max(1,Math.ceil((request.data?.total??0)/size));
  useEffect(()=>{if(request.data&&page>pages)setPage(pages);},[request.data,page,pages]);
  const apply=(next:MetricsFilters,showDetails=false)=>{const scoped={...next,...fixedFilters};setFilters(scoped);setDraft(scoped);setPage(1);setDetails(showDetails && !memberId);};
  const change=(field:keyof MetricsFilters,value:string)=>setDraft(previous=>({...previous,[field]:value||undefined}));
  const cycle=measure==='cycle';
  const select=(value:string,status?:string)=>apply({...filters,[kind==='heat'?'areaId':groupFilter[group]]:value,...(status?{status:status as MetricsFilters['status']}:{})},true);
  const selectMonth=(month:string)=>{const from=`${month}-01`;const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
    apply({...filters,dateFrom:filters.dateFrom&&filters.dateFrom>from?filters.dateFrom:from,dateTo:filters.dateTo&&filters.dateTo<end?filters.dateTo:end},true);
  };
  const rows=(charts?.[group]??[]).map(row=>({...row,label:group==='statuses'?operationsStatusLabel(row.label):group==='types'?(typeNames[row.label]??row.label):row.label}));
  const selectedLabels=Object.entries(filters).filter(([field,value])=>value&&!['population','dateBasis','dateFrom','dateTo','cohort'].includes(field)).map(([field,value])=>{
    const options=field==='areaId'?charts?.facets.areas:field==='crewId'?charts?.facets.crews:field==='instrumentManId'?charts?.facets.instrumentMen:undefined;
    return field==='status'?operationsStatusLabel(value):field==='ticketType'?(typeNames[value]??value):options?.find(o=>o.key===value)?.label??'Selected filter';
  });
  return <section className="kpi-explorer" data-audience={audience} aria-label="KPI explorer">
    {superintendent&&!fixedFilters.cohort?<div className="kpi-controls"><label>Workload view<select value={filters.cohort??'areaWorkload'} onChange={e=>{setGroup('areas');const {crewId,instrumentManId,...common}=filters;apply({...common,cohort:e.target.value as MetricsFilters['cohort']});}}><option value="areaWorkload">Area-wide workload</option><option value="linkedCrews">Linked-crew KPIs</option></select></label></div>:null}
    <div className="kpi-controls">
      <label>KPI<select value={measure} onChange={e=>{const next=e.target.value as KpiMeasure;setMeasure(next);if(next==='cycle'&&(kind==='donut'||kind==='gauge'))setKind('bar');apply(defaults(next,filters.cohort));}}>{measures[audience].map(value=><option key={value} value={value}>{titles[value]}</option>)}</select></label>
      <label>Visualization<select value={kind} onChange={e=>setKind(e.target.value as ChartKind)}>{Object.entries(chartNames).filter(([value])=>!cycle||!['donut','gauge'].includes(value)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {['bar','donut'].includes(kind)?<label>Group by<select value={group} onChange={e=>setGroup(e.target.value as Group)}>{Object.entries(groups).filter(([value])=>result?.analytics.personnelFilters||!['crews','instrumentMen'].includes(value)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>:null}
    </div>
    <form onSubmit={e=>{e.preventDefault();apply(draft);}}><details><summary>Filters and Date Range{selectedLabels.length?` · ${selectedLabels.length} Selected`:''}</summary><div className="kpi-controls">
      <label>Area<select value={draft.areaId??''} onChange={e=>change('areaId',e.target.value)}><option value="">All authorized Areas</option>{charts?.facets.areas.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
      <label>Request type<select value={draft.ticketType??''} onChange={e=>change('ticketType',e.target.value)}><option value="">All request types</option>{Object.entries(typeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Status<select value={draft.status??''} onChange={e=>change('status',e.target.value)}><option value="">All matching statuses</option>{['SUBMITTED','APPROVED','ASSIGNED','IN_PROGRESS','RETURNED_FOR_CORRECTION','PENDING_FIELD_VALIDATION','DELAYED','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED','REJECTED','PENDING_PC_APPROVAL'].map(value=><option key={value} value={value}>{operationsStatusLabel(value)}</option>)}</select></label>
      {result?.analytics.personnelFilters?<><label>Party Chief / crew<select value={draft.crewId??''} onChange={e=>change('crewId',e.target.value)}><option value="">All authorized crews</option>{charts?.facets.crews.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></label><label>Assigned Instrument Man<select value={draft.instrumentManId??''} onChange={e=>change('instrumentManId',e.target.value)}><option value="">All authorized assignments</option>{charts?.facets.instrumentMen.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></label></>:null}
      <label>Date basis<select value={draft.dateBasis??'needBy'} onChange={e=>change('dateBasis',e.target.value)}><option value="needBy">Need-By</option><option value="submitted">First submission</option><option value="completed">Completion</option></select></label>
      <label>From<input type="date" value={draft.dateFrom??''} onChange={e=>change('dateFrom',e.target.value)}/></label><label>Through<input type="date" min={draft.dateFrom} value={draft.dateTo??''} onChange={e=>change('dateTo',e.target.value)}/></label>
      <Button type="submit">Apply filters</Button>
    </div></details></form>
    <HeadingHelp label={titles[measure]} heading={<h3>{titles[measure]}</h3>} help={<span>{titles[measure]} · {cycle?'hours from first submission to completion':'request count'} · {superintendent?(linked?'linked crews within authorized Areas':'Area-wide workload, including unassigned and unlinked crews'):'authorized requests only'} · {filters.dateBasis==='submitted'?'First submission':filters.dateBasis==='completed'?'Completion':'Need-By'} {filters.dateFrom??'all dates'}{filters.dateTo?` through ${filters.dateTo}`:''} (UTC for timestamps){selectedLabels.length?` · ${selectedLabels.join(' · ')}`:''}</span>}/>
    <Button variant="secondary" onClick={()=>apply(defaults(measure,filters.cohort))}>Reset filters</Button>
    {!current?<div className="kpi-loading" role="status">Loading the authorized chart population…</div>:current.error?<div role="alert"><p>{current.error}</p><Button onClick={()=>setRevision(n=>n+1)}>Retry analytics</Button></div>:metrics&&charts?<>
      <p aria-live="polite"><strong>{(metrics.total??0).toLocaleString()}</strong> matching requests{cycle?` · ${metrics.coverage?.cycleSamples??0} valid turnaround samples`:''}</p>
      {metrics.total===0?<p>{linked&&result.analytics.linkedCrewCount===0?'No linked crews in your authorized Areas. Ask the Survey Manager to set explicit reporting links, or select Area-wide workload.':'No matching requests. Reset filters or widen the date range.'}</p>:<KpiChart kind={kind} rows={rows} months={charts.months} cells={charts.cells} cycle={cycle} total={metrics.total??0} denominator={metrics.populationTotal??0} title={titles[measure]} select={select} selectMonth={selectMonth}/>}
      {charts.limits.truncated?<p role="status">Partial chart: up to {charts.limits.groups} groups and the latest {charts.limits.months} months. Summary totals remain complete. Narrow the filters to inspect omitted groups.</p>:null}
      <details><summary>Data Coverage and Interpretation</summary><p>{metrics.coverage?.cycleSamples??0} valid turnaround samples; {metrics.coverage?.syntheticCompletions??0} generated completion dates, {metrics.coverage?.missingCycleDates??0} missing date pairs and {metrics.coverage?.invalidCycleDates??0} invalid date pairs excluded. Exclusion categories can overlap. {metrics.coverage?.undated??0} records lack the selected trend date.</p><p>{metrics.coverage?.imported??0} imported snapshots. Imports do not reconstruct audit transitions. Personnel groups show current request assignments, not who completed the work or employee productivity. Donut percentages describe displayed groups; the gauge uses the full population matching other filters.</p></details>
      {!memberId?<Button variant="secondary" onClick={()=>{setDetails(!details);setPage(1);}}>{details?'Hide matching requests':'Show matching requests'}</Button>:null}
      {details?<section aria-label="Matching KPI requests"><p className="kpi-scope">{cycle?'Completed population, including samples excluded from the average. ':''}Live records may change after this aggregate snapshot.</p>
        <div className="ops-pagination"><span>{request.data?.total??'…'} matching requests · page {page} of {pages}</span><label>Rows<select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><Button variant="secondary" disabled={page===1} onClick={()=>setPage(n=>n-1)}>Previous</Button><Button variant="secondary" disabled={page>=pages} onClick={()=>setPage(n=>n+1)}>Next</Button></div>
        {request.loading?<p role="status">Loading matching requests…</p>:request.error?<p role="alert">{request.error} <Button onClick={()=>setRevision(n=>n+1)}>Retry</Button></p>:<RecordCollection label="supporting requests" records={<>{request.data?.data.map(ticket=><li key={ticket.id}><Link className="app-link" href={`/projects/${projectId}/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link><span>{ticket.description}</span><small>{operationsStatusLabel(ticket.status)} · Need-By {ticket.requestedDate?.slice(0,10) ?? 'Not set'}</small></li>)}</>}/>}
      </section>:null}
    </>:null}
  </section>;
}
