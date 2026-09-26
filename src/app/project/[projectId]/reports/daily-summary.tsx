'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '@/app/ui/api';
import type { getDailySummary } from '@/modules/reporting/application';
import { localReportDate, reportDayWindow } from './report-day';
import styles from './reports.module.css';
type Summary=Omit<Awaited<ReturnType<typeof getDailySummary>>,'asOf'> & {asOf:string};

export function DailySummary({projectId,onAuthentication}:{projectId:string;onAuthentication:(signedIn:boolean)=>void}) {
  const [date,setDate]=useState(''),[revision,setRevision]=useState(0);
  const [summary,setSummary]=useState<Summary|null>(null),[loading,setLoading]=useState(false);
  const [error,setError]=useState(''),[authNeeded,setAuthNeeded]=useState(false);
  useEffect(()=>{setDate(localReportDate());},[]);
  useEffect(()=>{
    let current=true;setSummary(null);setError('');
    const window=reportDayWindow(date);
    if(!window){setLoading(false);return;}
    setLoading(true);
    const params=new URLSearchParams({view:'daily',...window});
    api<Summary>(`/api/projects/${projectId}/reports?${params}`).then(result=>{
      if(current){setSummary(result);setAuthNeeded(false);onAuthentication(true);}
    }).catch(cause=>{if(current){
      const unauthenticated=cause instanceof ApiError && cause.status===401;
      const denied=cause instanceof ApiError && cause.status===403;
      setAuthNeeded(unauthenticated);if(unauthenticated)onAuthentication(false);else if(denied)onAuthentication(true);
      setError(denied?'You do not have access to daily reports for this project.':errorMessage(cause));
    }}).finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[date,revision,projectId,onAuthentication]);
  return <section aria-label="Daily summary">
    <div className="panel"><label htmlFor="report-date">Report date · your local time</label>
      <input id="report-date" type="date" value={date} onChange={event=>setDate(event.target.value)}/>
      <p className="muted">Activity from midnight to the next midnight in your browser’s time zone. Today’s report is a partial day.</p>
      <button className="secondary" disabled={loading||!reportDayWindow(date)} onClick={()=>setRevision(n=>n+1)}>Refresh daily summary</button>
    </div>
    {!reportDayWindow(date)&&<p>Select a valid report date.</p>}
    {loading&&<p role="status">Loading daily activity…</p>}
    {error&&<div className="notice error" role="alert">{error}{authNeeded&&<p><Link href={`/login?next=${encodeURIComponent(`/project/${projectId}/reports`)}`}>Sign in to view reports</Link></p>}</div>}
    {summary&&<div className="panel"><h2>Daily activity</h2>
      <p>{new Date(summary.from).toLocaleString()} to {new Date(summary.until).toLocaleString()} (end excluded)</p>
      <p className="muted">Updated {new Date(summary.asOf).toLocaleString()}</p>
      <p>Only activity on requests you can currently view is included. A request may appear in several rows. Events count repeated actions; requests count each request once per row.</p>
      <p><strong>{summary.totalEvents} recorded events</strong></p>
      {summary.totalEvents===0&&<p>No recorded activity for this day.</p>}
      <div className={styles.dailyRows}>{summary.activity.map(item=><section key={item.eventType} className={styles.dailyRow}>
        <h3>{item.label}</h3><dl><div><dt>Requests</dt><dd>{item.requests}</dd></div><div><dt>Events</dt><dd>{item.events}</dd></div></dl>
      </section>)}</div>
    </div>}
  </section>;
}
