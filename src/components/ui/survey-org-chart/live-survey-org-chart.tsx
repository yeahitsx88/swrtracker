'use client';
import {useEffect,useRef,useState} from 'react';
import {apiClient,apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import type {CommandOwner} from '@/lib/frozen-command';
import type {SurveyOrganization} from '@/modules/tenancy/application/read-survey-organization';
import type {WorkforcePerson} from '@/modules/tenancy/application/survey-workforce';
import type {ProposedMove} from './fixtures';
import {Button,ErrorBanner} from '@/components/ui';
import {AdministrationDialog} from '../administration-dialog';
import {SurveyReorganization} from '../survey-reorganization';
import {AssignedWorkforce} from '../assigned-workforce';
import {SurveyOrgChartWorkspace} from './survey-org-chart-workspace';

/** Current authorized reads only. Visual choices launch the conventional governed review. */
export function LiveSurveyOrgChart({projectId,editorRole,owner,onReviewChange,onCommitted}:{projectId:string;editorRole?:'SURVEY_MANAGER'|'SURVEY_SUPERINTENDENT';owner?:CommandOwner;onReviewChange?:(open:boolean)=>void;onCommitted?:()=>void}) {
  const [revision,setRevision]=useState(0),[data,setData]=useState<SurveyOrganization>(),[error,setError]=useState<string>();
  const [proposal,setProposal]=useState<ProposedMove>(),[reviewLocked,setReviewLocked]=useState(false),[preparing,setPreparing]=useState(false),[reviewError,setReviewError]=useState<string>();
  const [crewReview,setCrewReview]=useState<{person:WorkforcePerson;target:WorkforcePerson;snapshot:string}>();
  const opening=useRef(false);
  useEffect(()=>{let active=true;apiClient.getSurveyOrganization(projectId).then(result=>{
    if(active){if(result.projectId!==projectId.toLowerCase())setError('The returned hierarchy belongs to another project. Reload to check your access.');else setData(result);}
  }).catch(cause=>{if(active)setError(getErrorMessage(cause,'Could not load the authorized hierarchy.'));});return()=>{active=false;};},[projectId,revision]);
  const reload=()=>{setData(undefined);setError(undefined);setRevision(n=>n+1);};
  const dismiss=()=>{if(reviewLocked||opening.current)return;setProposal(undefined);setCrewReview(undefined);setReviewError(undefined);onReviewChange?.(false);};
  const currentReadCompleted=()=>{setReviewLocked(false);setProposal(undefined);setCrewReview(undefined);onReviewChange?.(false);reload();};
  const committed=()=>{onCommitted?.();currentReadCompleted();};
  async function propose(move:ProposedMove){
    if(!editorRole||!data||data.project.status==='ARCHIVED'||opening.current||proposal)return;
    setProposal(move);setReviewError(undefined);onReviewChange?.(true);
    if(editorRole==='SURVEY_MANAGER')return;
    opening.current=true;setPreparing(true);
    try{
      const [context,source,target]=await Promise.all([apiClient.workforceContext(projectId),apiRequest<{person:WorkforcePerson}>(`/api/projects/${projectId}/survey/workforce?mode=person&personId=${move.personId}`),apiRequest<{person:WorkforcePerson}>(`/api/projects/${projectId}/survey/workforce?mode=person&personId=${move.destinationId}`)]);
      if(context.role!=='SURVEY_SUPERINTENDENT'||context.project.status==='ARCHIVED'||source.person.role!=='INSTRUMENT_MAN'||target.person.role!=='PARTY_CHIEF')throw new Error('Current authority or personnel changed. Close this review and reload the hierarchy.');
      setCrewReview({person:source.person,target:target.person,snapshot:context.snapshotToken!});
    }catch(cause){setReviewError(getErrorMessage(cause,'Could not read the current authorized crew move. Close this review and reload the hierarchy.'));}
    finally{opening.current=false;setPreparing(false);}
  }
  if(error)return <div className="org-workspace stack"><ErrorBanner message={error}/><Button variant="secondary" onClick={reload}>Reload hierarchy</Button></div>;
  if(!data)return <p className="org-workspace" role="status">Loading authorized project hierarchy…</p>;
  const subject=data.personnel.find(p=>p.userId===proposal?.personId),destination=data.personnel.find(p=>p.userId===proposal?.destinationId);
  return <>
    <SurveyOrgChartWorkspace key={`${projectId}:${revision}`} organization={data} onReload={reload} onPropose={editorRole&&data.project.status!=='ARCHIVED'?move=>void propose(move):undefined} reviewedMove={proposal} allowCrewMoves={editorRole==='SURVEY_MANAGER'}/>
    {proposal&&<AdministrationDialog title={subject?.role==='PARTY_CHIEF'?'Review Visual Crew Move':'Review Visual Crew Reassignment'} locked={reviewLocked||preparing} onDismiss={dismiss}>
      <p><strong>{subject?.name} ({proposal.personId})</strong> → {destination?.name} ({proposal.destinationId}). Placement is proposed until the governed action succeeds.</p>
      {reviewError&&<ErrorBanner message={reviewError}/>}{preparing&&<p role="status">Reading current authorized crew and staffing snapshot…</p>}
      {editorRole==='SURVEY_MANAGER'&&subject&&<SurveyReorganization owner={owner} projectId={projectId} archived={data.project.status==='ARCHIVED'} initialMove={subject.role==='PARTY_CHIEF'?{kind:'CREW',partyChiefId:proposal.personId,superintendentId:proposal.destinationId}:{kind:'INSTRUMENT_MAN',instrumentManId:proposal.personId,partyChiefId:proposal.destinationId}} onLockChange={setReviewLocked} onReviewReloaded={currentReadCompleted} onCommitted={committed}/>}
      {editorRole==='SURVEY_SUPERINTENDENT'&&crewReview&&<AssignedWorkforce projectId={projectId} role="SURVEY_SUPERINTENDENT" archived={false} initialReview={crewReview} onEditingChange={setReviewLocked} onReviewReloaded={currentReadCompleted} onCommitted={committed}/>}
      {!reviewLocked&&!preparing&&<Button variant="secondary" onClick={dismiss}>Cancel proposed move</Button>}
    </AdministrationDialog>}
  </>;
}
