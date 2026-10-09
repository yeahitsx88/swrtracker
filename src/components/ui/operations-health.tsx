'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AmeliaMetricsRecord } from '@/lib/contracts';
import { Button } from './button';
import type { KpiMeasure } from './kpi-explorer';
import './popout.css';
import {closePopup} from './popup-motion';
import {HeadingHelp} from './heading-help';

const KpiExplorer = dynamic(()=>import('./kpi-explorer').then(module=>module.KpiExplorer), { loading:()=> <p role="status">Loading analytics controls…</p> });
type Metric = Exclude<KpiMeasure,'all'>;
const titles: Record<Metric,string> = { open:'Open Requests',assignment:'Need Assignment',overdue:'Overdue Need-By',completed:'Completed',cycle:'Average Cycle' };

export function OperationsHealth({metrics,projectId,areaWide=false}:{metrics:AmeliaMetricsRecord;projectId:string;areaWide?:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [metric,setMetric]=useState<Metric>('open');
  const [opened,setOpened]=useState(false);
  const values:Record<Metric,string>={
    open:metrics.openTotal.toLocaleString(),assignment:metrics.approvedWithoutInstrumentMan.toLocaleString(),
    overdue:metrics.overdueNeedBy.toLocaleString(),completed:metrics.completedTotal.toLocaleString(),
    cycle:metrics.averageSubmissionToCompletionHours===null?'—':metrics.averageSubmissionToCompletionHours<0.05?'< 0.1 h':`${metrics.averageSubmissionToCompletionHours.toFixed(1)} h`,
  };
  return <>
    <section className="ops-health" aria-labelledby="queue-health-heading">
      <div className="ops-section-heading"><HeadingHelp label={areaWide?'Area-Wide Workload':'Queue Health'} heading={<h2 id="queue-health-heading">{areaWide?'Area-Wide Workload':'Queue Health'}</h2>} help="Select a measure to explore. Work demand and flow, not employee productivity. Cycle averages exclude generated or invalid date pairs."/></div>
      <div className="ops-metrics">{(Object.keys(titles) as Metric[]).map(key=><button type="button" className={`ops-metric ${key==='overdue'?'ops-attention':''}`} key={key}
        onClick={()=>{setMetric(key);setOpened(true);dialog.current?.showModal();}} aria-haspopup="dialog">
        <span>{titles[key]}</span><strong>{values[key]}</strong><span className="ops-metric-link">View details</span>
      </button>)}</div>
    </section>
    <dialog onCancel={event=>{event.preventDefault();closePopup(dialog.current);}} ref={dialog} className="ops-dialog popout-dialog" aria-labelledby="metric-heading" onClose={()=>setOpened(false)}>
      <div className="ops-section-heading popout-header"><h2 id="metric-heading">Explore Queue Health</h2><Button variant="secondary" onClick={()=>closePopup(dialog.current)}>Close</Button></div>
      <div className="popout-body">{opened?<KpiExplorer key={metric} projectId={projectId} initialMeasure={metric}/>:null}</div>
    </dialog>
  </>;
}
