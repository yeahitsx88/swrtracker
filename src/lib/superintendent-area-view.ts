import {ApiClientError,getErrorMessage} from '@/lib/errors';
import type {UUID} from '@/shared/types';
import type {SuperintendentAreaReadResult,SuperintendentAreaAssignment,SuperintendentAreaReplacement,UnlinkSuperintendentAreaInput,UnlinkSuperintendentAreaResult} from '@/modules/tenancy/application/superintendent-area.types';
type Detail=Extract<SuperintendentAreaReadResult,{mode:'superintendent-areas'}>;
type Replacements=Extract<SuperintendentAreaReadResult,{mode:'superintendent-area-replacements'}>;
type Reporting=Extract<SuperintendentAreaReadResult,{mode:'superintendent-area-reporting'}>;
export type SuperintendentAreaEditorState={superintendentId:UUID|null;detail:Detail|null;replacements:Replacements|null;reporting:Reporting|null;originalToken:string|null;assignment:SuperintendentAreaAssignment|null;replacement:SuperintendentAreaReplacement|null;confirmed:boolean;generation:number;loading:boolean;stale:boolean;pending:boolean;uncertain:boolean;attempt:{input:UnlinkSuperintendentAreaInput;key:string}|null;error:string|null;result:UnlinkSuperintendentAreaResult|null};
export type SuperintendentAreaEditorEvent={type:'person';superintendentId:UUID}|{type:'load';generation:number}|{type:'read';generation:number;data:SuperintendentAreaReadResult}|{type:'assignment';assignment:SuperintendentAreaAssignment}|{type:'replacement';replacement:SuperintendentAreaReplacement}|{type:'confirm';confirmed:boolean}|{type:'begin';key:string}|{type:'retry'|'cancel'|'reload'}|{type:'readFailure';generation:number;message:string}|{type:'stale';message?:string;generation?:number}|{type:'failure'|'uncertain';message:string}|{type:'success';result:UnlinkSuperintendentAreaResult};
export const initialSuperintendentAreaEditor=():SuperintendentAreaEditorState=>({superintendentId:null,detail:null,replacements:null,reporting:null,originalToken:null,assignment:null,replacement:null,confirmed:false,generation:0,loading:false,stale:false,pending:false,uncertain:false,attempt:null,error:null,result:null});
export function canConfirmSuperintendentAreaUnlink(s:SuperintendentAreaEditorState):boolean{
 return !!(s.detail&&s.detail.project.status!=='ARCHIVED'&&s.detail.project.crewBuild==='FULL'&&s.detail.person.active&&s.detail.person.role==='SURVEY_SUPERINTENDENT'&&s.assignment?.canUnlink&&s.replacement&&s.replacement.userId!==s.superintendentId&&s.originalToken&&s.replacements?.snapshotToken===s.originalToken&&s.replacements.replacements.data.some(c=>c.userId===s.replacement!.userId&&c.replacementGrantId===s.replacement!.replacementGrantId&&c.replacementAssignmentId===s.replacement!.replacementAssignmentId)&&s.confirmed&&!s.loading&&!s.stale&&!s.error&&!s.pending&&!s.uncertain);
}
export function reduceSuperintendentAreaEditor(s:SuperintendentAreaEditorState,e:SuperintendentAreaEditorEvent):SuperintendentAreaEditorState{
 if((s.pending||s.uncertain)&&!['retry','failure','uncertain','stale','success'].includes(e.type))return s;
 switch(e.type){
  case 'person':return {...initialSuperintendentAreaEditor(),superintendentId:e.superintendentId,generation:s.generation+1,stale:s.stale};
  case 'load':return e.generation>s.generation?{...s,generation:e.generation,loading:true,error:s.stale?s.error:null}:s;
  case 'read':{
   if(e.generation!==s.generation||e.data.person.userId!==s.superintendentId)return s;
   const stale=s.stale||!!(s.originalToken&&s.originalToken!==e.data.snapshotToken);
   const common={...s,originalToken:s.originalToken??e.data.snapshotToken,loading:false,stale,error:stale?s.error:null};
   return e.data.mode==='superintendent-areas'?{...common,detail:e.data}:e.data.mode==='superintendent-area-replacements'?{...common,replacements:e.data}:{...common,reporting:e.data};
  }
  case 'assignment':return {...s,assignment:e.assignment,replacement:null,replacements:null,reporting:null,confirmed:false,generation:s.generation+1,error:null,result:null};
  case 'replacement':return {...s,replacement:e.replacement,confirmed:false,error:null};
  case 'confirm':return {...s,confirmed:e.confirmed};
  case 'begin':return canConfirmSuperintendentAreaUnlink(s)?{...s,pending:true,error:null,result:null,attempt:{key:e.key,input:{action:'unlink-superintendent-area',superintendentId:s.superintendentId!,linkId:s.assignment!.assignmentId,replacementUserId:s.replacement!.userId,replacementGrantId:s.replacement!.replacementGrantId,replacementAssignmentId:s.replacement!.replacementAssignmentId,expectedSnapshot:s.originalToken!,confirmUnlink:true}}}:s;
  case 'retry':return s.uncertain&&!s.pending&&s.attempt?{...s,pending:true,error:null}:s;
  case 'uncertain':return {...s,pending:false,uncertain:true,error:e.message};
  case 'failure':return {...s,pending:false,uncertain:false,attempt:null,confirmed:false,error:e.message};
  case 'stale':return e.generation!==undefined&&e.generation!==s.generation?s:{...s,pending:false,uncertain:false,attempt:null,stale:true,confirmed:false,error:e.message??null,generation:s.generation+1,loading:false};
  case 'readFailure':return e.generation===s.generation?{...s,loading:false,error:e.message}:s;
  case 'cancel':return {...s,assignment:null,replacement:null,replacements:null,reporting:null,confirmed:false,error:null,generation:s.generation+1};
  case 'reload':return {...initialSuperintendentAreaEditor(),superintendentId:s.superintendentId,generation:s.generation+1};
  case 'success':return {...s,pending:false,uncertain:false,attempt:null,assignment:null,replacement:null,replacements:null,reporting:null,confirmed:false,result:e.result,error:null};
 }
}
export function superintendentAreaFailure(error:unknown):SuperintendentAreaEditorEvent{
 if(error instanceof ApiClientError&&error.status===409)return {type:'stale',message:getErrorMessage(error,'Area obligations changed. Reload current Area obligations.')};
 if(!(error instanceof ApiClientError)||error.status>=500)return {type:'uncertain',message:'The response is uncertain. Keep this confirmation unchanged and retry to recover the recorded result.'};
 return {type:'failure',message:getErrorMessage(error,'Area unlink refused. Review current obligations before trying again.')};
}

/** Read failures cannot freeze a mutation retry; only a current read conflict
 * latches stale, and old generations cannot invalidate a different draft. */
export function superintendentAreaReadFailure(error:unknown,generation:number):SuperintendentAreaEditorEvent{
 if(error instanceof ApiClientError&&error.status===409)return {type:'stale',generation,message:getErrorMessage(error,'Area obligations changed. Reload current Area obligations.')};
 return {type:'readFailure',generation,message:getErrorMessage(error,'Unable to read Area obligations. Retry the read.')};
}
