import {createHash,randomUUID} from 'node:crypto';
import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';
import {ConflictError,NotFoundError} from '@/shared/errors';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {SqlRecommissionRepository} from './recommission-project.repository';
import type {PreparationCancellationRepository,PreparationCancellationPreview,PreparationCancellationCommand} from '../application/cancel-project-preparation';
export class SqlPreparationCancellationRepository implements PreparationCancellationRepository{
 async preview(db:DbClient,auth:AuthContext,projectId:UUID):Promise<PreparationCancellationPreview>{
  const scope=[auth.tenantId,projectId];if(!(await db.query('SELECT id FROM projects WHERE tenant_id=$1 AND id=$2 FOR UPDATE',scope)).rows[0])throw new NotFoundError('Project not found');
  const base=await new SqlRecommissionRepository().preview(db,auth,projectId);
  const pending=(await db.query<{id:string;started_at:Date;reason:string;reviewed_evidence:PreparationCancellationPreview}>(`SELECT id,started_at,reason,reviewed_evidence FROM project_preparation_cancellations WHERE tenant_id=$1 AND project_id=$2 AND completed_at IS NULL`,scope)).rows[0];
  const completed=(await db.query<{snapshot:string}>(`SELECT c.completion_evidence->'reviewedEvidence'->>'snapshot' AS snapshot FROM project_preparation_cancellations c JOIN projects p ON p.tenant_id=c.tenant_id AND p.id=c.project_id AND p.status='ARCHIVED' AND p.archived_at=c.completed_at AND p.archived_by=c.completed_by WHERE c.tenant_id=$1 AND c.project_id=$2 AND c.completed_at IS NOT NULL ORDER BY c.completed_at DESC,c.id DESC LIMIT 1`,scope)).rows[0];
  const work=base.work.filter(r=>r.detail!=='REJECTED'),blockers:string[]=[];
  if(work.length)blockers.push(`${work.length} unfinished request(s) must be completed, cancelled or soft-deleted through their authorized controls.`);
  if(base.invitations.length)blockers.push(`${base.invitations.length} outstanding invitation(s) must be cancelled or otherwise resolved.`);
  const snapshot=createHash('sha256').update(JSON.stringify({base,pending,completed})).digest('hex');
  return {snapshot,status:base.status,recommissioningId:base.periodId,cancellationId:pending?.id??null,startedAt:pending?.started_at.toISOString()??null,reason:pending?.reason??null,startedSnapshot:pending?.reviewed_evidence.snapshot??null,completedSnapshot:completed?.snapshot??null,work,invitations:base.invitations,blockers};
 }
 async start(db:DbClient,auth:AuthContext,projectId:UUID,command:PreparationCancellationCommand,preview:PreparationCancellationPreview){
  const id=randomUUID();await db.query(`INSERT INTO project_preparation_cancellations(id,tenant_id,project_id,recommissioning_id,started_by,reason,reviewed_evidence) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,auth.tenantId,projectId,preview.recommissioningId,auth.userId,command.reason,JSON.stringify(preview)]);
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:'project.preparation_cancellation_started',authorityEvidence:{centralIT:true},changes:{cancellationId:id,reason:command.reason,reviewedEvidence:preview,completionOnly:true,historyRetained:true,setupChangesRetained:true}});
  return {cancellationId:id};
 }
 async finish(db:DbClient,auth:AuthContext,projectId:UUID,command:PreparationCancellationCommand,preview:PreparationCancellationPreview){
  const evidence={reason:command.reason,reviewedEvidence:preview};
  const ended=await db.query(`UPDATE project_preparation_cancellations SET completed_at=NOW(),completed_by=$4,completion_evidence=$5 WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND completed_at IS NULL RETURNING id`,[auth.tenantId,projectId,preview.cancellationId,auth.userId,JSON.stringify(evidence)]);
  if(!ended.rows[0])throw new ConflictError('Preparation cancellation changed. Reload current evidence.');
  if(preview.recommissioningId){const closed=await db.query(`UPDATE project_recommissioning SET cancelled_at=NOW(),cancelled_by=$4 WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND opened_at IS NULL AND cancelled_at IS NULL RETURNING id`,[auth.tenantId,projectId,preview.recommissioningId,auth.userId]);if(!closed.rows[0])throw new ConflictError('Reopening preparation changed. Reload current evidence.');}
  const project=await db.query(`UPDATE projects SET status='ARCHIVED',archived_at=NOW(),archived_by=$3 WHERE tenant_id=$1 AND id=$2 AND status='SETUP' RETURNING id`,[auth.tenantId,projectId,auth.userId]);if(!project.rows[0])throw new ConflictError('Project lifecycle changed. Reload current evidence.');
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:'project.preparation_cancelled',authorityEvidence:{centralIT:true},changes:{cancellationId:preview.cancellationId,recommissioningId:preview.recommissioningId,...evidence,terminalStatus:'ARCHIVED',historyRetained:true,setupChangesRetained:true}});
  return {cancellationId:preview.cancellationId!};
 }
}
