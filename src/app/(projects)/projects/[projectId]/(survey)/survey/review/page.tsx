'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useProjectWorkspace} from '@/components/ui/project-shell-header';
import {useTicketPage} from '@/lib/use-ticket-page';
import {apiClient,apiRequest} from '@/lib/apiClient';
import type {RejectionProposal} from '@/modules/ticket/application/rejection-proposal';
import type {TicketRecord} from '@/lib/contracts';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {AdministrationRecords} from '@/components/ui/administration-records';
import {AdministrationDialog} from '@/components/ui/administration-dialog';
import {PaginationControls} from '@/components/forms';
import {useTeamCommand} from '@/components/ui/team-management';

function ReviewDecision({ticket,canReject,done}:{ticket:TicketRecord;canReject:boolean;done:(message?:string)=>void}){
  const command=useTeamCommand(),[action,setAction]=useState<'approve'|'reject'>('approve'),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [proposal,setProposal]=useState<RejectionProposal|null>(),[loadError,setLoadError]=useState(false);
  useEffect(()=>{let active=true;apiRequest<{proposal:RejectionProposal|null}>('/api/tickets/'+ticket.id+'/rejection-proposal').then(data=>{if(active)setProposal(data.proposal);}).catch(()=>{if(active)setLoadError(true);});return()=>{active=false;};},[ticket.id]);
  const blocked=proposal===undefined||(!canReject&&!!proposal);
  const valid=!blocked&&confirmed&&(action==='approve'||!!reason.trim());
  return <AdministrationDialog title="Review request" locked={command.locked} onDismiss={()=>done()}><form className="stack" onSubmit={event=>{event.preventDefault();if(!valid)return;void command.run(action,{ticketId:ticket.id,reason},key=>action==='approve'?apiClient.approveTicket(ticket.id,key):canReject?apiClient.rejectTicket(ticket.id,reason,key):apiRequest('/api/tickets/'+ticket.id+'/rejection-proposal',{method:'POST',body:{reason},headers:{'Idempotency-Key':key}}),()=>done(action==='approve'?'Request approved. It is ready for assignment.':canReject?'Request rejected.':'Rejection proposed. A Superintendent or Survey Manager will review it.'));}}>
    <h3>{ticket.ticketNumber??'Request'}</h3><p>{ticket.description}</p>
    {proposal?<section aria-label="Proposed rejection"><h3>A Chief proposed rejection</h3><p>{proposal.reason}</p><p>{canReject?'Review the reason, then reject the request or approve it instead.':'Waiting for a Superintendent or Survey Manager to decide.'}</p></section>:proposal===undefined?<p role="status">{loadError?'Unable to load review details. Close this dialog and try again.':'Loading review details…'}</p>:null}
    <label className="field"><span className="field-label">Decision</span><select aria-label="Decision" className="select" value={action} disabled={command.locked||blocked} onChange={event=>{setAction(event.target.value as 'approve'|'reject');setConfirmed(false);}}><option value="approve">{proposal?'Approve instead':'Approve request'}</option><option value="reject">{canReject?'Reject request':'Propose rejection'}</option></select></label>
    {action==='reject'?<label className="field"><span className="field-label">Reason for rejection</span><textarea className="textarea" required maxLength={2000} value={reason} disabled={command.locked} onChange={event=>{setReason(event.target.value);setConfirmed(false);}}/></label>:null}
    <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked} onChange={event=>setConfirmed(event.target.checked)}/><span>I have reviewed this request and confirm my decision.</span></label>
    {command.error?<ErrorBanner message={command.error}/>:null}<div className="row"><Button type="submit" disabled={!valid||command.busy||command.stale}>{command.busy?'Saving…':command.uncertain?'Retry unchanged decision':'Confirm decision'}</Button>{command.stale?<Button variant="secondary" type="button" onClick={()=>{if(command.reset())done();}}>Reload requests</Button>:null}</div>
  </form></AdministrationDialog>;
}

export default function SurveyReviewPage(){
  const {projectId}=useParams<{projectId:string}>(),context=useProjectWorkspace();
  const role=context?.capabilities.operationalRole,enabled=!!role&&['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(role);
  const [page,setPage]=useState(1),[revision,setRevision]=useState(0),[selected,setSelected]=useState<TicketRecord>(),[message,setMessage]=useState<string>();
  const requests=useTicketPage(projectId,page,25,{status:'SUBMITTED'},enabled,revision);
  if(!enabled)return <p>Your current project role does not review survey requests.</p>;
  return <section className="panel stack"><h1>Review requests</h1><p className="muted">Check new requests for the Areas your team covers. Approved requests are ready for a crew assignment.</p>
    {message?<SuccessBanner message={message}/>:null}{requests.error?<ErrorBanner message={requests.error}/>:null}<div><Button variant="secondary" disabled={!!selected} onClick={()=>setRevision(value=>value+1)}>Refresh requests</Button></div>
    {requests.loading?<p role="status">Loading requests…</p>:null}
    {requests.data?<><AdministrationRecords label="requests awaiting review" rows={requests.data.data} id={ticket=>ticket.id} preferencesKey={`project:${projectId}:survey-review`} columns={[{key:'number',label:'Number',text:ticket=>ticket.ticketNumber??'Request'},{key:'request',label:'Request',text:ticket=>ticket.description}]} actions={ticket=><div className="row"><Link className="button button-secondary" href={`/projects/${projectId}/tickets/${ticket.id}`}>Open request</Link><Button disabled={context?.project.status!=='ACTIVE'||!!selected} onClick={()=>setSelected(ticket)}>Review</Button></div>}/><PaginationControls total={requests.data.total} offset={(page-1)*25} limit={25} onChange={offset=>setPage(offset/25+1)}/></>:null}
    {selected?<ReviewDecision ticket={selected} canReject={role!=='PARTY_CHIEF'} done={result=>{setSelected(undefined);setMessage(result);setRevision(value=>value+1);}}/>:null}
  </section>;
}
