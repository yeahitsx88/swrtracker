'use client';
import {useState} from 'react';
import {useParams} from 'next/navigation';
import {useProjectWorkspace} from '@/components/ui/project-shell-header';
import {useTicketPage} from '@/lib/use-ticket-page';
import {apiClient,apiRequest} from '@/lib/apiClient';
import type {TicketRecord} from '@/lib/contracts';
import type {ProjectCapabilities} from '@/lib/contracts/account-offboarding';
import {useAreaNames} from '@/lib/use-area-names';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {AdministrationRecords} from '@/components/ui/administration-records';
import {PaginationControls} from '@/components/forms';
import {SubmittedRequestRecovery} from '@/components/tickets/submitted-request-recovery';
import {ReviewDecision} from '@/components/tickets/review-decision';
import {useRequestDetailsDialog} from '@/components/tickets/request-details-dialog';

export default function SurveyReviewPage(){
  const {projectId}=useParams<{projectId:string}>(),context=useProjectWorkspace();
  const areaNames=useAreaNames(projectId);
  const role=context?.capabilities.operationalRole,enabled=!!role&&['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(role);
  const [page,setPage]=useState(1),[revision,setRevision]=useState(0),[selected,setSelected]=useState<TicketRecord>(),[message,setMessage]=useState<string>();
  const [recoveryLocked,setRecoveryLocked]=useState(false),[reviewBlocked,setReviewBlocked]=useState(false);
  async function reloadReview(){const [,projects,current]=await Promise.all([apiClient.listTickets(projectId,25,(page-1)*25,{status:'SUBMITTED',sort:'operations'}),apiClient.listProjects(),apiRequest<{capabilities:ProjectCapabilities}>(`/api/projects/${projectId}/capabilities`)]);const project=projects.projects.find(item=>item.id===projectId);if(!project)throw new Error('Your current project workspace is unavailable. Keep this review open until current access can be checked.');setReviewBlocked(project.status!=='ACTIVE'||current.capabilities.operationalRole!==role);}
  const requests=useTicketPage(projectId,page,25,{status:'SUBMITTED'},enabled,revision);
  const details=useRequestDetailsDialog(projectId,()=>setRevision(value=>value+1));
  if(!enabled)return <p>Your current project role does not review survey requests.</p>;
  return <>{details.dialog}<section className="panel stack"><h1>Review requests</h1><p className="muted">Check new requests for the Areas your team covers. Approved requests are ready for a crew assignment.</p>
    {reviewBlocked?<p role="status">Project status or your role changed. Reopen this project workspace before reviewing another request.</p>:null}
    {message?<SuccessBanner message={message}/>:null}{requests.error?<ErrorBanner message={requests.error}/>:null}<div><Button variant="secondary" disabled={!!selected||recoveryLocked} onClick={()=>setRevision(value=>value+1)}>Refresh requests</Button></div>
    {requests.loading?<p role="status">Loading requests…</p>:null}
    {requests.data?<><AdministrationRecords label="requests awaiting review" rows={requests.data.data} id={ticket=>ticket.id} preferencesKey={`project:${projectId}:survey-review`} columns={[{key:'number',label:'Number',text:ticket=>ticket.ticketNumber??'Request'},{key:'request',label:'Request',text:ticket=>ticket.description}]} actions={ticket=><div className="row"><Button variant="secondary" disabled={!!selected||recoveryLocked} onClick={()=>details.open(ticket.id)}>Open request</Button><Button disabled={context?.project.status!=='ACTIVE'||reviewBlocked||!!selected||recoveryLocked} onClick={()=>setSelected(ticket)}>Review</Button></div>}/><PaginationControls total={requests.data.total} offset={(page-1)*25} limit={25} onChange={offset=>setPage(offset/25+1)}/></>:null}
    {selected?<ReviewDecision areaPath={selected.aorNodeId?areaNames.get(selected.aorNodeId)?.path:undefined} ticket={selected} canReject={role!=='PARTY_CHIEF'} reload={reloadReview} done={result=>{setSelected(undefined);setMessage(result);setRevision(value=>value+1);}}/>:null}
  </section><SubmittedRequestRecovery projectId={projectId} readOnly={!!selected} onLockChange={setRecoveryLocked}/></>;
}
