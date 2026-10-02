'use client';

import type { MetricBucket, MetricsCharts } from '@/modules/reporting/application/amelia-metrics';
import { operationsStatusLabel } from '@/lib/operations-view';
import { chartColor } from '@/lib/display-labels';

export type ChartKind = 'heat' | 'bar' | 'trend' | 'donut' | 'gauge';
export const chartNames: Record<ChartKind,string> = { heat:'Heat map', bar:'Bar chart', trend:'Monthly trend', donut:'Donut chart', gauge:'Population share gauge' };
export interface ChartProps {
  rows: MetricBucket[]; months: MetricBucket[]; cells: MetricsCharts['cells']; cycle: boolean;
  total: number; denominator: number; title: string;
  select: (key: string, status?: string) => void; selectMonth: (key: string) => void;
}
const value = (row: MetricBucket, cycle: boolean) => cycle ? row.cycleHours : row.count;
const formatted = (n: number | null, cycle: boolean) => n === null ? 'No valid dates' : `${n.toLocaleString(undefined,{maximumFractionDigits:cycle?1:0})}${cycle?' h':''}`;
const MAX_SLICES = 6;
function Bars(p: ChartProps) {
  const max = Math.max(1,...p.rows.map(row=>value(row,p.cycle)??0));
  return <ul className="kpi-bars">{p.rows.map(row=><li key={row.key}><button type="button" disabled={row.key==='__unassigned__'} onClick={()=>p.select(row.key)}>
    <span>{row.label}</span><strong>{formatted(value(row,p.cycle),p.cycle)}</strong>
    <span className="kpi-track" aria-hidden="true"><span style={{width:`${(value(row,p.cycle)??0)/max*100}%`}} /></span>
  </button></li>)}</ul>;
}
function Heat(p: ChartProps) {
  const areas=[...new Map(p.cells.map(c=>[c.key,c.label])).entries()];
  const statuses=[...new Set(p.cells.map(c=>c.status))];
  const max=Math.max(1,...p.cells.map(c=>value(c,p.cycle)??0));
  return <div className="kpi-scroll" tabIndex={0} role="region" aria-label="Area by status heat map"><table className="ops-heatmap"><caption>{p.title} by Area and status · {p.cycle?'average hours':'requests'}; darker means more</caption>
    <thead><tr><th scope="col">Area</th>{statuses.map(s=><th key={s} scope="col">{operationsStatusLabel(s)}</th>)}</tr></thead>
    <tbody>{areas.map(([key,label])=><tr key={key}><th scope="row">{label}</th>{statuses.map(status=>{
      const row=p.cells.find(c=>c.key===key&&c.status===status); const n=row?value(row,p.cycle):p.cycle?null:0;
      return <td key={status} style={{background:`rgb(70 130 180 / ${.06+(n??0)/max*.25})`}}><button type="button" disabled={!row||key==='__unassigned__'} onClick={()=>p.select(key,status)} aria-label={`${label}, ${operationsStatusLabel(status)}: ${formatted(n,p.cycle)}`}>{formatted(n,p.cycle)}</button></td>;
    })}</tr>)}</tbody></table></div>;
}
function Trend(p: ChartProps) {
  const max=Math.max(1,...p.months.map(row=>value(row,p.cycle)??0));
  const width=Math.max(600,p.months.length*48);
  const x=(i:number)=>50+i*(width-80)/Math.max(1,p.months.length-1);
  const y=(n:number)=>200-n/max*160;
  return <><div className="kpi-scroll" tabIndex={0} role="region" aria-label="Monthly trend"><svg width={width} height="240" role="img" aria-label={`${p.title} monthly trend; exact values follow`}>
    <path d={`M50 30 V200 H${width-25}`} fill="none" stroke="var(--muted)" />
    <text x="4" y="40" fill="currentColor">{formatted(max,p.cycle)}</text><text x="25" y="204" fill="currentColor">0</text>
    {p.months.map((row,i)=>{ const n=value(row,p.cycle); const prev=i?value(p.months[i-1]!,p.cycle):null; return n===null?null:<g key={row.key}>
      {prev!==null?<line x1={x(i-1)} y1={y(prev)} x2={x(i)} y2={y(n)} stroke="var(--action)" strokeWidth="2"/>:null}
      <circle cx={x(i)} cy={y(n)} r="4" fill="var(--action)"/><text x={x(i)} y="227" textAnchor="middle" fill="currentColor">{row.label}</text>
    </g>;})}</svg></div><details><summary>Monthly values and request drill-downs</summary><ul className="kpi-values">{p.months.map(row=><li key={row.key}><button type="button" onClick={()=>p.selectMonth(row.key)}>{row.label}: {formatted(value(row,p.cycle),p.cycle)}</button></li>)}</ul></details></>;
}
function Donut(p: ChartProps) {
  const sum=p.rows.reduce((n,row)=>n+row.count,0); let offset=0;
  const ordered=[...p.rows].sort((a,b)=>b.count-a.count);
  const remainder=ordered.length>MAX_SLICES?ordered.slice(MAX_SLICES-1):[];
  const slices=remainder.length?[...ordered.slice(0,MAX_SLICES-1),{key:'__other__',label:`Other (${remainder.length} categories)`,count:remainder.reduce((n,row)=>n+row.count,0)}]:ordered;
  const label=(row:{label:string;count:number})=>`${row.label}: ${row.count.toLocaleString()} (${sum?(row.count/sum*100).toFixed(1):0}%)`;
  return <div className="kpi-donut"><svg viewBox="0 0 160 160" role="img" aria-label={`${sum.toLocaleString()} displayed requests; exact shares in legend`}>
    {slices.map((row,i)=>{ const share=sum?row.count/sum*100:0; const start=offset; offset+=share; return <circle key={row.key} cx="80" cy="80" r="60" pathLength="100" fill="none" stroke={chartColor(row.key,i)} strokeWidth="24" strokeDasharray={`${share} ${100-share}`} strokeDashoffset={-start} transform="rotate(-90 80 80)"><title>{label(row)}</title></circle>; })}
    <text x="80" y="85" textAnchor="middle" fill="var(--ink)">{sum.toLocaleString()}</text>
  </svg><ul className="kpi-values">{slices.map((row,i)=><li key={row.key}>{row.key==='__other__'?<details><summary><span className="kpi-swatch" style={{background:chartColor(row.key,i)}}/>{label(row)}</summary><ul>{remainder.map(item=><li key={item.key}><button type="button" disabled={item.key==='__unassigned__'} onClick={()=>p.select(item.key)}>{label(item)}</button></li>)}</ul></details>:<button type="button" disabled={row.key==='__unassigned__'} onClick={()=>p.select(row.key)}><span className="kpi-swatch" style={{background:chartColor(row.key,i)}}/>{label(row)}</button>}</li>)}</ul></div>;
}
function Gauge(p: ChartProps) {
  const percent=p.denominator?p.total/p.denominator*100:null;
  return <div className="kpi-gauge"><label>{p.title} share of requests matching the other filters<meter min={0} max={p.denominator||1} value={p.total}>{percent===null?'No population':`${percent.toFixed(1)}%`}</meter></label>
    <strong>{percent===null?'No matching population':`${percent.toFixed(1)}%`}</strong><p>{p.total.toLocaleString()} selected / {p.denominator.toLocaleString()} authorized requests matching the other filters. This is an operational share, not an SLA target or productivity score.</p></div>;
}
const renderers: Record<ChartKind,(props:ChartProps)=>React.ReactNode>={heat:Heat,bar:Bars,trend:Trend,donut:Donut,gauge:Gauge};
export function KpiChart({kind,...props}:ChartProps&{kind:ChartKind}) { const Renderer=renderers[kind]; return <Renderer {...props}/>; }

export interface ComparisonPoint { key: string; primary: number; secondary: number }

/** Two recorded event series, with a native table for exact daily values. */
export function KpiComparisonTrend({ points, title, primaryLabel, secondaryLabel }: {
  points: ComparisonPoint[]; title: string; primaryLabel: string; secondaryLabel: string;
}) {
  const max = Math.max(1, ...points.flatMap(point => [point.primary, point.secondary]));
  const x = (index: number) => 42 + index * 550 / Math.max(1, points.length - 1);
  const y = (count: number) => 156 - count / max * 126;
  const series = (field: 'primary' | 'secondary') => points.map((point, index) => `${x(index)},${y(point[field])}`).join(' ');
  if (!points.length) return <p className="muted">No recorded activity in this window. Broaden the dates to inspect another period.</p>;
  return <div className="kpi-comparison">
    <div className="kpi-comparison-legend"><span><i className="kpi-comparison-key kpi-comparison-primary" />{primaryLabel}</span><span><i className="kpi-comparison-key kpi-comparison-secondary" />{secondaryLabel}</span></div>
    <svg viewBox="0 0 620 180" role="img" aria-label={`${title}; exact daily counts follow`}>
      <path d="M42 30 V156 H592" fill="none" stroke="var(--line)" />
      <text x="4" y="34">{max.toLocaleString()}</text><text x="20" y="160">0</text>
      <polyline points={series('primary')} fill="none" stroke="var(--action)" strokeWidth="3" strokeLinejoin="round" />
      <polyline points={series('secondary')} fill="none" stroke="var(--muted)" strokeWidth="3" strokeLinejoin="round" />
    </svg>
    <div className="kpi-comparison-range"><time dateTime={points[0]!.key}>{points[0]!.key}</time><time dateTime={points.at(-1)!.key}>{points.at(-1)!.key}</time></div>
    <details><summary>Exact daily counts</summary><div className="kpi-comparison-table"><table><thead><tr><th scope="col">Date · UTC</th><th scope="col">{primaryLabel}</th><th scope="col">{secondaryLabel}</th></tr></thead><tbody>{points.map(point => <tr key={point.key}><th scope="row">{point.key}</th><td>{point.primary.toLocaleString()}</td><td>{point.secondary.toLocaleString()}</td></tr>)}</tbody></table></div></details>
  </div>;
}
