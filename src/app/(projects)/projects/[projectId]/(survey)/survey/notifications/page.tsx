 'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import {Button,ErrorBanner} from '@/components/ui';
import type {SurveyInbox} from '@/modules/notification/application/survey-inbox';
export default function SurveyNotifications(){
 const {projectId}=useParams<{projectId:string}>();
 const [offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const [data,setData]=useState<SurveyInbox>(),[error,setError]=useState<string>();
 useEffect(()=>{let active=true;setData(undefined);setError(undefined);
 apiRequest<SurveyInbox>(`/api/projects/${projectId}/survey/notifications?offset=${offset}`).then(value=>{if(active)setData(value);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load notifications. Try again.'));});
 return()=>{active=false;};},[projectId,offset,revision]);
 return <section className="panel stack" aria-labelledby="notifications-title">
 <div className="panel-header"><div><h1 id="notifications-title" className="panel-title">Notifications</h1><p className="muted">Updates sent to you about survey work and changes to your team.</p></div><Button variant="secondary" onClick={()=>setRevision(value=>value+1)}>Refresh</Button></div>
 {error?<ErrorBanner message={error}/>:!data?<p role="status">Loading notifications…</p>:<>
 {data.messages.length?<ul className="stack" aria-label="Survey notifications">{data.messages.map(message=><li key={message.id}><h2>{message.title}</h2><p>{message.message}</p><time className="muted" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>{message.ticketId?<p><Link className="button button-secondary" href={`/projects/${projectId}/tickets/${message.ticketId}`}>Open request</Link></p>:null}</li>)}</ul>:<p>No notifications on this page.</p>}
 <div className="row"><Button variant="secondary" disabled={!offset} onClick={()=>setOffset(value=>Math.max(0,value-25))}>Newer</Button><span role="status">Page {offset/25+1}</span><Button variant="secondary" disabled={!data.hasMore} onClick={()=>setOffset(value=>value+25)}>Older</Button></div>
 </>}
 </section>;
}
