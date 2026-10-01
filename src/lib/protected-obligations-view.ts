import {ApiClientError,getErrorMessage} from '@/lib/errors';
import type {UUID} from '@/shared/types';
import type {CoverageIntent,ProtectedReadResult,ReviewerCandidate,ReviewerObligation,ResolveReviewerInput,ResolveReviewerResult} from '@/modules/tenancy/application/protected-obligations.types';
type Detail=Extract<ProtectedReadResult,{mode:'obligations'}>;
type Candidates=Extract<ProtectedReadResult,{mode:'candidates'}>;
export type ProtectedEditorState={userId:UUID|null;detail:Detail|null;originalToken:string|null;grant:ReviewerObligation|null;candidate:ReviewerCandidate|null;candidates:Candidates|null;candidateToken:string|null;mode:'reuse'|'assignAdditional'|null;intent:CoverageIntent|null;confirmed:boolean;additionalConfirmed:boolean;generation:number;loading:boolean;stale:boolean;pending:boolean;uncertain:boolean;attempt:{input:ResolveReviewerInput;key:string}|null;error:string|null;result:ResolveReviewerResult|null};
export type ProtectedEditorEvent={type:'person';userId:UUID|null}|{type:'load';generation:number}|{type:'obligations';generation:number;data:Detail}|{type:'candidates';generation:number;data:Candidates}|{type:'readFailure';generation:number;message:string}|{type:'grant';grant:ReviewerObligation}|{type:'candidate';candidate:ReviewerCandidate}|{type:'mode';mode:'reuse'|'assignAdditional'}|{type:'intent';intent:CoverageIntent|null}|{type:'additional'|'confirm';confirmed:boolean}|{type:'begin';key:string}|{type:'retry'|'cancel'|'reload'}|{type:'stale';message?:string}|{type:'failure'|'uncertain';message:string}|{type:'success';result:ResolveReviewerResult};
export const initialProtectedEditor=():ProtectedEditorState=>({userId:null,detail:null,originalToken:null,grant:null,candidate:null,candidates:null,candidateToken:null,mode:null,intent:null,confirmed:false,additionalConfirmed:false,generation:0,loading:false,stale:false,pending:false,uncertain:false,attempt:null,error:null,result:null});
export const coveragePreview=(candidate:ReviewerCandidate)=>({review:candidate.missingReviewGrant?'Add review grant':'Reuse existing review grant',individual:candidate.missingIndividualAssignment?'Add individual Area assignment':'Reuse existing individual Area assignment'});
export function canConfirmProtectedResolution(s:ProtectedEditorState):boolean{
 return !!(s.detail&&s.detail.project.status!=='ARCHIVED'&&s.grant?.canResolve&&s.candidate&&s.candidate.userId!==s.userId&&s.originalToken&&s.candidateToken===s.originalToken&&!s.loading&&!s.error&&!s.stale&&!s.pending&&!s.uncertain&&s.confirmed&&
 (s.mode==='reuse'?s.candidate.canReuse:s.mode==='assignAdditional'&&!s.candidate.canReuse&&s.intent&&s.additionalConfirmed));
}
export function reduceProtectedEditor(s:ProtectedEditorState,e:ProtectedEditorEvent):ProtectedEditorState{
 if((s.pending||s.uncertain)&&!['retry','failure','uncertain','success','stale'].includes(e.type))return s;
 switch(e.type){
  case 'person':return {...initialProtectedEditor(),userId:e.userId,generation:s.generation+1,stale:s.stale};
  case 'load':return e.generation>s.generation?{...s,generation:e.generation,loading:true,error:s.stale?s.error:null}:s;
  case 'obligations':return e.generation===s.generation&&e.data.person.userId===s.userId?{...s,detail:e.data,originalToken:s.originalToken??e.data.snapshotToken,loading:false,error:s.stale?s.error:null,stale:s.stale||!!(s.originalToken&&s.originalToken!==e.data.snapshotToken)}:s;
  case 'candidates':return e.generation===s.generation?{...s,candidates:e.data,candidateToken:e.data.snapshotToken,loading:false,error:s.stale?s.error:null,stale:s.stale||e.data.snapshotToken!==s.originalToken}:s;
  case 'readFailure':return e.generation===s.generation?{...s,loading:false,error:e.message}:s;
  case 'grant':return {...s,grant:e.grant,candidate:null,candidates:null,candidateToken:null,mode:null,intent:null,confirmed:false,additionalConfirmed:false,result:null,error:null,generation:s.generation+1};
  case 'candidate':return {...s,candidate:e.candidate,mode:e.candidate.canReuse?'reuse':'assignAdditional',intent:null,confirmed:false,additionalConfirmed:false,error:null};
  case 'mode':return {...s,mode:e.mode,intent:null,confirmed:false,additionalConfirmed:false};
  case 'intent':return {...s,intent:e.intent,confirmed:false,additionalConfirmed:false};
  case 'additional':return {...s,additionalConfirmed:e.confirmed};
  case 'confirm':return {...s,confirmed:e.confirmed};
  case 'begin':{
   if(!canConfirmProtectedResolution(s))return s;
   const common={userId:s.userId!,grantId:s.grant!.grantId,replacementUserId:s.candidate!.userId,expectedSnapshot:s.originalToken!,confirmResolution:true as const};
   const input:ResolveReviewerInput=s.mode==='reuse'?{...common,coverageMode:'reuse'}:{...common,coverageMode:'assignAdditional',confirmAdditionalCoverage:true,coverageIntent:s.intent!};
   return {...s,pending:true,attempt:{input,key:e.key},error:null,result:null};
  }
  case 'retry':return s.uncertain&&!s.pending&&s.attempt?{...s,pending:true,error:null}:s;
  case 'uncertain':return {...s,pending:false,uncertain:true,error:e.message};
  case 'failure':return {...s,pending:false,uncertain:false,attempt:null,error:e.message,confirmed:false,additionalConfirmed:false};
  case 'stale':return {...s,pending:false,uncertain:false,attempt:null,stale:true,error:e.message??null,confirmed:false,additionalConfirmed:false};
  case 'success':return {...s,pending:false,uncertain:false,attempt:null,grant:null,candidate:null,candidates:null,candidateToken:null,confirmed:false,additionalConfirmed:false,result:e.result,error:null};
  case 'cancel':return {...s,grant:null,candidate:null,candidates:null,candidateToken:null,confirmed:false,additionalConfirmed:false,error:null,generation:s.generation+1};
  case 'reload':return {...initialProtectedEditor(),userId:s.userId,generation:s.generation+1};
 }
}

/** A definitive conflict cannot be rebased by an automatic read. */
export function protectedResolutionFailure(error:unknown):ProtectedEditorEvent{
 if(error instanceof ApiClientError&&error.status===409)return {type:'stale',message:getErrorMessage(error,'Handover conflict. Reload current obligations.')};
 if(!(error instanceof ApiClientError)||error.status>=500)return {type:'uncertain',message:'The response is uncertain. Keep this confirmation unchanged and retry it to recover the recorded result.'};
 return {type:'failure',message:getErrorMessage(error,'Handover refused. Reload current obligations before trying again.')};
}
