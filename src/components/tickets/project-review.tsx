'use client';
import {HeadingHelp} from '@/components/ui/heading-help';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import {AdministrationRecords,AdministrationSection} from '@/components/ui/administration-records';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { TICKET_STATUS_LABELS, type TicketPriority, type TicketStatus, type TicketType } from '@/lib/contracts';
import { PRIORITY_LABELS, TICKET_TYPE_LABELS, chartColor } from '@/lib/display-labels';
import type { ReviewBucket, ReviewResult } from '@/modules/ticket/application/review-tickets';
import './project-review.css';
import { ReviewChartLane } from './review-chart-lane';

type Filters = Record<string, string>;
const keys = ['query','areaId','status','ticketType','priority','crewId','dateFrom','dateTo','dateBasis','queue','order'];
const filterLabels: Record<string,string> = {query:'Search',areaId:'Area',status:'Status',ticketType:'Request type',priority:'Priority',crewId:'Party Chief',dateFrom:'From',dateTo:'Through',dateBasis:'Date basis',queue:'Population',order:'Sort'};
const label = (v: string) => v === 'REQUESTER_CANCELED' ? 'Canceled by requester' : TICKET_STATUS_LABELS[v as TicketStatus] ?? TICKET_TYPE_LABELS[v as TicketType] ?? PRIORITY_LABELS[v as TicketPriority] ?? (/^[A-Z][A-Z_]*$/.test(v) ? v.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c => c.toUpperCase()) : v);
const num = (v: number) => v.toLocaleString();
const date = (v: string | null) => v ? v.slice(0,10) : 'Not recorded';

function Bars({ rows, select }: { rows: ReviewBucket[]; select: (key: string) => void }) {
  const max = Math.max(1,...rows.map(r => r.count));
  return <div className="review-bars">{rows.map(r => <button key={r.key} onClick={() => select(r.key)} aria-label={`${label(r.label)}: ${num(r.count)} requests; filter requests`}><span>{label(r.label)}</span><strong>{num(r.count)}</strong><span className="review-bar-track" aria-hidden="true"><span style={{width:`${r.count/max*100}%`}} /></span></button>)}</div>;
}
export function ProjectReview({ projectId }: { projectId: string }) {
  const [ready,setReady] = useState(false);
  const [filters,setFilters] = useState<Filters>({});
  const [draft,setDraft] = useState<Filters>({});
  const [page,setPage] = useState(1), [size,setSize] = useState(25);
  const [tab,setTab] = useState('overview'), [revision,setRevision] = useState(0);
  const [snapshot,setSnapshot] = useState<{key:string; data?:ReviewResult; error?:string}>();
  const [facets,setFacets] = useState<ReviewResult['facets']>();
  const key = JSON.stringify([projectId,filters,page,size,revision]);
  const data = snapshot?.key === key ? snapshot.data : undefined;
  const error = snapshot?.key === key ? snapshot.error : undefined;
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const initial = Object.fromEntries(keys.filter(k => search.has(k)).map(k => [k,search.get(k)!]));
    setFilters(initial); setDraft(initial); setTab(search.get('view') === 'requests' ? 'requests' : 'overview'); setReady(true);
  },[]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    apiClient.reviewTickets(projectId,{...filters,limit:size,offset:(page-1)*size}).then(result => {
      if (!active) return;
      setSnapshot({key,data:result}); setFacets(result.facets);
      if (page>1 && (page-1)*size>=result.total) setPage(Math.max(1,Math.ceil(result.total/size)));
    }).catch(cause => { if(active) setSnapshot({key,error:getErrorMessage(cause,'Unable to load project review.')}); });
    return () => { active=false; };
  },[key,ready]);
  useEffect(() => {
    if (!ready) return;
    const search = new URLSearchParams(filters);
    if (tab === 'requests') search.set('view', 'requests');
    window.history.replaceState(null,'',`${window.location.pathname}${search.size ? `?${search}` : ''}`);
  },[filters,tab,ready]);
  function apply(next: Filters) {
    const clean = Object.fromEntries(Object.entries(next).filter(([,v]) => v.trim()).map(([k,v]) => [k,v.trim()]));
    setFilters(clean); setDraft(clean); setPage(1);
  }
  function drill(next: Filters) { apply({...filters,...next}); setTab('requests'); }
  const field = (name:string,value:string) => setDraft(d => ({...d,[name]:value}));
  function select(title:string,name:string,rows:Array<{key:string;label:string}>,empty?:string) {
    return <label className="field"><span className="field-label">{title}</span><select className="select" value={draft[name]??''} onChange={e => field(name,e.target.value)}><option value="">{empty??`All ${title.toLowerCase()}`}</option>{rows.map(r => <option key={r.key} value={r.key}>{label(r.label)}</option>)}</select></label>;
  }
  const total=data?.total??0, pages=Math.max(1,Math.ceil(total/size));
  const completion=total ? Math.round((data?.completed??0)/total*1000)/10 : 0;
  let segmentStart=0;
  return <section className="review-workspace stack" aria-label="Project review">
    <div className="review-heading"><div><HeadingHelp label={data?.imported ? 'Historical Closeout Review' : 'Project Review'} heading={<h2 className="panel-title">{data?.imported ? 'Historical Closeout Review' : 'Project Review'}</h2>} help={<span>Read-only requests within your access. Start with all history, then narrow your view.</span>}/></div><a className="app-link" href="#review-results">Skip to results</a></div>
    <form className="panel stack" onSubmit={e => {e.preventDefault();apply(draft);}}>
      <HeadingHelp label="Request Filters" heading={<h3>Request Filters</h3>} help="Date filters exclude records missing that date. Choices come only from requests you can access." />
      <div className="review-search"><label className="field"><span className="field-label">Search requests</span><input className="input" maxLength={200} value={draft.query??''} placeholder="Number, description, contact or requester" onChange={e => field('query',e.target.value)} /></label><button className="button">Apply filters</button><button type="button" className="button button-secondary" onClick={() => apply({})}>Reset all</button></div>
      <details className="review-filter-details"><summary>Refine by Area, Status, Crew or Dates · {Object.keys(filters).length} Active</summary><div className="review-filter-grid">
        {select('Areas','areaId',facets?.areas??[])}{select('Statuses','status',facets?.statuses??[])}{select('Request types','ticketType',facets?.types??[])}{select('Party Chiefs','crewId',facets?.crews??[])}
        {select('Priority','priority',['NORMAL','MEDIUM','MED_HIGH','HIGH'].map(key => ({key,label:key})))}
        {select('Work population','queue',[{key:'open',label:'Open exceptions'},{key:'completed',label:'Completed'},{key:'assignment',label:'Needs assignment'}],'All requests')}
        {select('Date basis','dateBasis',[{key:'submitted',label:'First submission'},{key:'completed',label:'Completion (may be simulated)'}],'Need-By')}
        {['dateFrom','dateTo'].map(k => <label className="field" key={k}><span className="field-label">{k==='dateFrom'?'From (inclusive)':'Through (inclusive)'}</span><input className="input" type="date" value={draft[k]??''} onChange={e => field(k,e.target.value)} /></label>)}
        {select('Sort requests','order',[{key:'oldest',label:'Oldest first'},{key:'needBy',label:'Need-By, earliest first'}],'Newest first')}
      </div></details>
      {Object.keys(filters).length>0 && <div className="review-active" aria-label="Applied filters">{Object.entries(filters).map(([k,v]) => <button type="button" className="app-link" key={k} aria-label={`Remove ${filterLabels[k]} filter`} onClick={() => apply({...filters,[k]:''})}>{filterLabels[k]}: {label(facets?.areas.find(r => r.key===v)?.label??facets?.crews.find(r => r.key===v)?.label??v)} ×</button>)}</div>}
    </form>
    <div className="tabs review-tabs" aria-label="Review views"><button className="app-link" aria-pressed={tab==='overview'} onClick={() => setTab('overview')}>Overview</button><button className="app-link" aria-pressed={tab==='requests'} onClick={() => setTab('requests')}>Requests{data?` (${num(total)})`:''}</button></div>
    <div id="review-results" className="stack" aria-busy={!data&&!error}>
      {!data&&!error && <p role="status" className="panel muted">Loading filtered history…</p>}
      {error && <div className="panel"><p role="alert" className="error-banner">{error}</p><button className="button button-secondary" onClick={() => setRevision(revision+1)}>Retry</button></div>}
      {data && <><div className="review-scope"><p role="status"><strong>{num(total)}</strong> matching requests · Need-By {date(data.firstDate)} – {date(data.lastDate)}</p>
        {data.imported>0 && <details><summary>Simulation Data Notes · {num(data.imported)} Imported Snapshots · {num(data.simulatedCompletions)} Generated Completion Dates</summary><p>Supported imported records only; unsupported source request categories were excluded during import. Identities and prose are anonymized; attachments and historical transition trails are unavailable. Instrument Man assignments are simulated. Historical cancellations use a display mapping; the original cancellation path is unknown. Completion dates may be generated. This is not employee-performance evidence.</p></details>}</div>
        {!total ? <div className="panel"><HeadingHelp label={"No Matching Requests"} heading={<h3 className="panel-title">No Matching Requests</h3>} help={<span>Broaden the dates or remove a filter. Charts are not calculated from an empty selection.</span>}/><button className="button button-secondary" onClick={() => apply({})}>Reset all filters</button></div>
        : tab==='overview' ? <><div className="review-summary"><button onClick={() => drill({})}>Matching Requests<strong>{num(total)}</strong></button><button onClick={() => drill({queue:'completed',status:''})}>Completed<strong>{num(data.completed)}</strong></button><button onClick={() => drill({queue:'open',status:''})}>Open Exceptions<strong>{num(data.open)}</strong></button><div><label htmlFor="review-completion">Completed Share · {completion}%</label><meter id="review-completion" min={0} max={total} value={data.completed}>{completion}%</meter></div></div>
          <ReviewChartLane><section className="panel review-chart"><HeadingHelp label="Recorded Status" heading={<h3 className="panel-title">Recorded Status</h3>} help="Select a status to see supporting requests." /><div className="review-status-chart"><svg viewBox="0 0 120 120" role="img" aria-label={`Status distribution of ${num(total)} requests`}>{data.statuses.map((r,i) => {const length=r.count/total*100,start=segmentStart;segmentStart+=length;return <circle key={r.key} cx="60" cy="60" r="44" fill="none" stroke={chartColor(r.key,i)} strokeWidth="16" pathLength="100" strokeDasharray={`${length} ${100-length}`} strokeDashoffset={-start} transform="rotate(-90 60 60)"/>;})}<text x="60" y="58" textAnchor="middle">{completion}%</text><text className="review-svg-label" x="60" y="73" textAnchor="middle">completed</text></svg><div className="review-status-legend">{data.statuses.map((r,i) => <button key={r.key} onClick={() => drill({status:r.key,queue:''})}><span className="review-swatch" style={{background:chartColor(r.key,i)}}/><span>{label(r.label)}</span><strong>{num(r.count)}</strong></button>)}</div></div></section>
          <section className="panel review-chart"><h3 className="panel-title">Requests by Area</h3><Bars rows={data.areas} select={areaId => drill({areaId})}/></section>
          <section className="panel review-chart"><h3 className="panel-title">Request Mix</h3><Bars rows={data.types} select={ticketType => drill({ticketType})}/></section>
          <section className="panel review-chart"><HeadingHelp label="Monthly Request Distribution" heading={<h3 className="panel-title">Monthly Request Distribution</h3>} help={<span>{filters.dateBasis==='completed'?'Completion (may be simulated)':filters.dateBasis==='submitted'?'First submission':'Need-By'} · latest 120 populated months. Select a month to review.</span>} />{data.months.length ? <div className="review-months" tabIndex={0} aria-label="Monthly counts; scroll for more months">{data.months.map(r => <button key={r.key} onClick={() => {const [y,m]=r.key.split('-').map(Number);drill({dateFrom:`${r.key}-01`,dateTo:new Date(Date.UTC(y!,m!,0)).toISOString().slice(0,10)});}}><strong>{num(r.count)}</strong><span className="review-month-column"><span style={{height:`${Math.max(1,r.count/Math.max(...data.months.map(m => m.count))*100)}%`}}/></span><span>{r.label}</span></button>)}</div>:<p className="muted">No recorded dates for this date basis.</p>}</section><section className="panel stack review-chart"><AdministrationSection title="Recorded Chart Values"><AdministrationRecords scrollable label="status distribution" rows={data.statuses} id={r=>r.key} columns={[{key:'label',label:'Status',text:r=>label(r.label)},{key:'count',label:'Requests',text:r=>String(r.count)}]} actions={r=><button className="button button-secondary chart-review-action" onClick={()=>drill({status:r.key,queue:''})}><Icon name="search" />Review requests</button>}/><AdministrationRecords scrollable label="Area distribution" rows={data.areas} id={r=>r.key} columns={[{key:'label',label:'Area',text:r=>label(r.label)},{key:'count',label:'Requests',text:r=>String(r.count)}]} actions={r=><button className="button button-secondary chart-review-action" onClick={()=>drill({areaId:r.key})}><Icon name="search" />Review requests</button>}/><AdministrationRecords scrollable label="request type distribution" rows={data.types} id={r=>r.key} columns={[{key:'label',label:'Type',text:r=>label(r.label)},{key:'count',label:'Requests',text:r=>String(r.count)}]}/><AdministrationRecords scrollable label="monthly distribution" rows={data.months} id={r=>r.key} columns={[{key:'month',label:'Month',text:r=>r.label},{key:'count',label:'Requests',text:r=>String(r.count)}]}/></AdministrationSection></section></ReviewChartLane></>
        : <section className="panel stack" aria-label="Filtered requests"><div className="review-pagination"><label className="field"><span className="field-label">Items per page</span><select className="select" value={size} onChange={e => {setSize(Number(e.target.value));setPage(1);}}>{[10,25,50,100].map(n => <option key={n}>{n}</option>)}</select></label><p>{num((page-1)*size+1)}–{num(Math.min(page*size,total))} of {num(total)}</p><button className="button button-secondary" disabled={page<=1} onClick={() => setPage(page-1)}>Previous</button><span>Page {page} of {pages}</span><button className="button button-secondary" disabled={page>=pages} onClick={() => setPage(page+1)}>Next</button></div>
          <AdministrationRecords label="reviewed requests on this page" rows={data.items} id={r=>r.id} columns={[
 {key:'number',label:'Number',text:r=>r.number??'Unnumbered request'}, {key:'description',label:'Request',className:'request-description-column',text:r=>r.description},
 {key:'requester',label:'Requester',text:r=>r.requester},{key:'type',label:'Type',className:'request-type-column',text:r=>label(r.type)}, {key:'area',label:'Area',text:r=>r.area},
 {key:'status',label:'Status',text:r=>label(r.status),render:r=><StatusBadge status={r.status as TicketStatus} viewerIsRequester={false}/>},{key:'date',label:'Need-By',text:r=>r.needBy??'',render:r=>date(r.needBy)},
 {key:'crew',label:'Party Chief',text:r=>r.crew??'Not assigned'}, {key:'completed',label:'Completed',text:r=>r.completedAt??'',render:r=>date(r.completedAt)}
 ]} actions={r=><Link className="button button-secondary chart-review-action" href={`/projects/${projectId}/tickets/${r.id}`}><Icon name="search" />Open request details</Link>}/></section>}
      </>}
    </div>
  </section>;
}
