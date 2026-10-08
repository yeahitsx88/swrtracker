import {ConflictError,ValidationError} from '@/shared/errors';
import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';
import {requireRecommissionAuthority,type RecommissionRecord} from './recommission-project';
export interface PreparationCancellationCommand{action:'START'|'FINISH';snapshot:string;reason:string;confirmed:true}
export interface PreparationCancellationPreview{snapshot:string;status:string;recommissioningId:string|null;cancellationId:string|null;startedAt:string|null;reason:string|null;startedSnapshot:string|null;completedSnapshot:string|null;work:RecommissionRecord[];invitations:RecommissionRecord[];blockers:string[]}
export interface PreparationCancellationRepository{
 preview(db:DbClient,auth:AuthContext,projectId:UUID):Promise<PreparationCancellationPreview>;
 start(db:DbClient,auth:AuthContext,projectId:UUID,command:PreparationCancellationCommand,preview:PreparationCancellationPreview):Promise<{cancellationId:string}>;
 finish(db:DbClient,auth:AuthContext,projectId:UUID,command:PreparationCancellationCommand,preview:PreparationCancellationPreview):Promise<{cancellationId:string}>;
}
export function parsePreparationCancellation(value:unknown):PreparationCancellationCommand{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('Review and confirm preparation cancellation.');
 const b=value as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['action','snapshot','reason','confirmed'].includes(k))||!['START','FINISH'].includes(String(b.action))||typeof b.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(b.snapshot)||typeof b.reason!=='string'||b.reason.trim().length<10||b.reason.trim().length>1000||/[\x00-\x1f]/.test(b.reason)||b.confirmed!==true)throw new ValidationError('Current evidence, a reason (10-1000 characters) and explicit confirmation are required.');
 return {action:b.action as 'START'|'FINISH',snapshot:b.snapshot,reason:b.reason.trim(),confirmed:true};
}
/** Caller holds EXCLUSIVE tenant barrier, current session and one effect/audit/ledger transaction. */
export async function cancelProjectPreparation(repo:PreparationCancellationRepository,db:DbClient,auth:AuthContext,projectId:UUID,command:PreparationCancellationCommand){
 await requireRecommissionAuthority(db,auth);
 const preview=await repo.preview(db,auth,projectId);
 if(preview.status!=='SETUP')throw new ConflictError('Only a project in preparation can be cancelled.');
 if(preview.snapshot!==command.snapshot)throw new ConflictError('Preparation evidence changed. Reload current evidence and renew consent.','STALE_PREPARATION_CANCELLATION');
 if(command.action==='START'){
  if(preview.cancellationId)throw new ConflictError('Preparation cancellation has already begun.');
  return repo.start(db,auth,projectId,command,preview);
 }
 if(!preview.cancellationId)throw new ConflictError('Start preparation cancellation before completing it.');
 if(preview.blockers.length)throw new ConflictError(preview.blockers.join(' '),'PREPARATION_CANCELLATION_BLOCKED');
 return repo.finish(db,auth,projectId,command,preview);
}

/** Current phase/evidence precedes replay; only matching terminal FINISH can replay after archival. */
export async function authorizePreparationCancellationCommand(repo:PreparationCancellationRepository,db:DbClient,auth:AuthContext,projectId:UUID,command:PreparationCancellationCommand){
 await requireRecommissionAuthority(db,auth);const preview=await repo.preview(db,auth,projectId);
 const expected=command.action==='START'?(preview.cancellationId?preview.startedSnapshot:preview.snapshot):preview.status==='ARCHIVED'?preview.completedSnapshot:preview.snapshot;
 if((command.action==='START'&&preview.status!=='SETUP')||(command.action==='FINISH'&&!['SETUP','ARCHIVED'].includes(preview.status))||expected!==command.snapshot)throw new ConflictError('Preparation phase or evidence changed. Reload current evidence and renew consent.','STALE_PREPARATION_CANCELLATION');
}
