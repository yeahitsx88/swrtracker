'use client';
import {useAdministrationNotice} from './administration-workspace';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {useAdministrationProgress} from '@/lib/use-administration-progress';
import {Button,Card,ErrorBanner,Input,SuccessBanner,Textarea} from '@/components/ui';
import {AdministrationRecords} from './administration-records';
import {headingCase} from '@/lib/heading-case';
type Ticket={id:string;projectId:string;projectName:string;subject:string;description:string;requesterName:string;status:string;version:number;createdAt:string};
type Detail={ticket:{id:string;status:string;version:number};messages:Array<{id:string;message:string;actorName:string;createdAt:string}>;canManage:boolean};
type Intent={url:string;method:'POST'|'PATCH';body:Record<string,unknown>};
const statusLabel=(s:string)=>headingCase(s.toLowerCase().replaceAll('_',' '));
export function HelpDesk({projectId,owner:providedOwner}:{projectId?:string;owner?:CommandOwner}){
 const local=useRef(new CommandOwner()).current,owner=providedOwner??local,token=`help-desk:${projectId??'tenant'}`;
 useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 useAdministrationProgress(owner,providedOwner?(projectId?`/projects/${projectId}/admin`:'/accounts'):`/projects/${projectId}/help-desk`);
 const gate=useRef(new FrozenCommand<Intent>());
 const [tickets,setTickets]=useState<Ticket[]>([]),[canManage,setCanManage]=useState(false),[authorized,setAuthorized]=useState(false),[total,setTotal]=useState(0),[offset,setOffset]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>();
 const [creating,setCreating]=useState(false),[subject,setSubject]=useState(''),[description,setDescription]=useState(''),[selected,setSelected]=useState<Ticket>(),[detail,setDetail]=useState<Detail>(),[reply,setReply]=useState(''),[status,setStatus]=useState('OPEN'),[consent,setConsent]=useState(false);
 const [,render]=useState(0),[readFailed,setReadFailed]=useState(false);const reading=useRef(false);const blocked=owner.blocked(token),locked=loading||blocked||gate.current.locked;
 const url=projectId?`/api/projects/${projectId}/help-desk`:'/api/help-desk';
 async function load(page=offset,renew=false){
  if(reading.current||owner.blocked(token)||gate.current.pending||gate.current.command&&!gate.current.stale)return;
  reading.current=true;setLoading(true);setError(undefined);
  try{
   const [result]=await Promise.all([apiRequest<{tickets:Ticket[];total:number;canManage:boolean}>(`${url}?offset=${page}`),renew&&selected?apiRequest<Detail>(`/api/projects/${selected.projectId}/help-desk/${selected.id}`):Promise.resolve()]);
   if(renew&&!gate.current.reload())return;
   setAuthorized(true);setTickets(result.tickets);setTotal(result.total);setCanManage(result.canManage);setOffset(page);setReadFailed(false);
   if(renew){owner.release(token);setCreating(false);setSelected(undefined);setDetail(undefined);setReply('');setSubject('');setDescription('');setConsent(false);}
  }catch(e){setReadFailed(gate.current.stale);if(!gate.current.locked&&e instanceof ApiClientError&&[401,403,404].includes(e.status)){setAuthorized(false);setTickets([]);setCreating(false);setSelected(undefined);setDetail(undefined);}setError(getErrorMessage(e,'Unable to load the current help desk. Return to Projects to check your access.'));}
  finally{reading.current=false;setLoading(false);}
 }
 useEffect(()=>{void load(0);},[projectId]);
 async function inspect(ticket:Ticket){if(locked||reading.current)return;reading.current=true;setLoading(true);setSelected(ticket);setDetail(undefined);setReply('');setConsent(false);setError(undefined);setSuccess(undefined);setCreating(false);try{const r=await apiRequest<Detail>(`/api/projects/${ticket.projectId}/help-desk/${ticket.id}`);setDetail(r);setStatus(r.ticket.status);}catch(e){setError(getErrorMessage(e,'Unable to open this help desk conversation.'));}finally{reading.current=false;setLoading(false);}}
 async function submit(){if(loading||blocked||gate.current.pending||gate.current.stale||!consent||!owner.claim(token))return;
  const intent:Intent=creating?{url,method:'POST',body:{subject:subject.trim(),description:description.trim(),confirmed:true}}:{url:`/api/projects/${selected?.projectId}/help-desk/${selected?.id}`,method:'PATCH',body:{version:detail?.ticket.version,message:reply.trim(),...(detail?.canManage?{status}:{}),confirmed:true}};
  const attempt=gate.current.begin(intent,crypto.randomUUID());if(!attempt)return;render(n=>n+1);setError(undefined);setSuccess(undefined);
  try{await apiRequest(attempt.body.url,{method:attempt.body.method,body:attempt.body.body,headers:{'Idempotency-Key':attempt.key}});gate.current.success();owner.release(token);setCreating(false);setSelected(undefined);setDetail(undefined);setConsent(false);setSubject('');setDescription('');setSuccess(attempt.body.method==='POST'?'Help desk ticket submitted to this project’s administrators.':'Reply saved. The status decision is recorded in the conversation.');void load();}
  catch(e){gate.current.fail(e instanceof ApiClientError?e.status:undefined);if(!gate.current.locked)owner.release(token);setError(getErrorMessage(e,'Outcome uncertain. Retry the unchanged help desk decision.'));}finally{render(n=>n+1);}
 }
 function close(){if(loading||blocked)return;if(gate.current.stale){void load(offset,true);return;}if(gate.current.reload()){owner.release(token);setCreating(false);setSelected(undefined);setDetail(undefined);setConsent(false);setReply('');void load();}}
 useAdministrationNotice(token,{source:projectId?'Project Help Desk':'Tenant Help Desk',href:projectId?`/projects/${projectId}/admin/help-desk`:'/accounts/help-desk',tone:error?'error':success?'success':'status',message:gate.current.pending?'Saving the reviewed decision…':gate.current.stale?'State changed. Return to this action, deliberately reload and review again.':gate.current.command?'Outcome uncertain. Return to this action and retry the unchanged decision.':error??(success)??''});
 return <Card title={projectId?'Project Help Desk':'Tenant Help Desk'} description={projectId?'Project members can ask for assistance. Project Admin and Tenant Admin handle the queue; escalation sends the ticket to the tenant queue. Ordinary members see only their own help desk tickets.':'Review help desk tickets across this tenant. Escalated tickets appear first. Each reply remains scoped to its originating project.'}><div className="stack">
 {readFailed&&<p role="alert">Current help desk records could not be loaded. Your reviewed decision remains held. Reload Help Desk must successfully read the current queue and selected conversation before a fresh selection and confirmation.</p>} {error&&<ErrorBanner message={error}/>} {success&&<SuccessBanner message={success}/>} {loading&&<p role="status">Loading help desk…</p>}
 <div className="row">{projectId&&authorized&&<Button disabled={locked||loading} onClick={()=>{setCreating(true);setSelected(undefined);setDetail(undefined);setConsent(false);setSuccess(undefined);}}>New Help Desk Ticket</Button>}<Button variant="secondary" disabled={locked||loading} onClick={()=>void load()}>Refresh Help Desk</Button></div>
 {authorized&&<><AdministrationRecords scrollable label={canManage?'help desk queue':'your help desk tickets'} rows={tickets} id={t=>t.id} disabled={locked||loading} columns={[{key:'subject',label:'Subject',text:t=>t.subject},{key:'person',label:'Requested By',text:t=>t.requesterName},...(!projectId?[{key:'project',label:'Project',text:(t:Ticket)=>t.projectName}]:[]),{key:'status',label:'Status',text:t=>statusLabel(t.status),render:t=><span className="badge badge-neutral">{statusLabel(t.status)}</span>},{key:'created',label:'Submitted',text:t=>new Date(t.createdAt).toLocaleString()}]} actions={t=><Button variant="secondary" disabled={locked||loading} onClick={()=>void inspect(t)}>Open Conversation</Button>}/>
 <div className="row"><Button variant="secondary" disabled={locked||loading||!offset} onClick={()=>void load(Math.max(0,offset-25))}>Previous Tickets</Button><span role="status">{total} authorized tickets</span><Button variant="secondary" disabled={locked||loading||offset+25>=total} onClick={()=>void load(offset+25)}>Next Tickets</Button></div></>}
 {(creating||selected)&&<section className="administration-command-review stack" aria-label={creating?'Submit Help Desk Ticket':'Help Desk Conversation'}>
 <h3 className="panel-title">{creating?'Request Project Assistance':selected?.subject}</h3>
 {creating?<><label className="field"><span className="field-label">Subject</span><Input maxLength={120} value={subject} disabled={locked} onChange={e=>{setSubject(e.target.value);setConsent(false);}}/></label><label className="field"><span className="field-label">What happened, and what help do you need?</span><Textarea maxLength={4000} value={description} disabled={locked} onChange={e=>{setDescription(e.target.value);setConsent(false);}}/></label></>:<><p>{selected?.description}</p>{!detail?<p role="status">{loading?'Loading conversation…':'Open this conversation again to load current replies.'}</p>:<><ol className="help-desk-conversation">{detail.messages.map(m=><li key={m.id}><p><strong>{m.actorName}</strong> · <time>{new Date(m.createdAt).toLocaleString()}</time></p><p className="help-desk-message">{m.message}</p></li>)}</ol>{detail.messages.length===200&&<p>Showing the latest 200 replies.</p>}<label className="field"><span className="field-label">Reply</span><Textarea maxLength={4000} value={reply} disabled={locked} onChange={e=>{setReply(e.target.value);setConsent(false);}}/></label>{detail.canManage&&<label className="field"><span className="field-label">Reviewed status</span><select className="select" value={status} disabled={locked} onChange={e=>{setStatus(e.target.value);setConsent(false);}}>{['OPEN','IN_PROGRESS','RESOLVED','ESCALATED'].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>}{status==='ESCALATED'&&detail.canManage&&<p>This ticket remains visible to Project Admin and appears first in Tenant Admin’s help desk queue.</p>}</>}</>}
 <label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I reviewed and confirm {creating?'this assistance request':'this reply and any status change'}.</span></label>
 <div className="row"><Button disabled={loading||blocked||!consent||gate.current.pending||gate.current.stale||(creating?subject.trim().length<3||description.trim().length<10:!detail||!reply.trim())} onClick={()=>void submit()}>{gate.current.pending?'Saving…':gate.current.command&&!gate.current.stale?'Retry Unchanged Decision':creating?'Submit Help Desk Ticket':'Save Reply'}</Button><Button variant="secondary" disabled={loading||blocked||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={close}>{gate.current.stale?'Reload Help Desk':'Close'}</Button></div>
 {gate.current.stale&&<p role="alert">The conversation changed. Reload the help desk and confirm the current conversation before replying again.</p>}
 </section>}
 </div></Card>;
}
