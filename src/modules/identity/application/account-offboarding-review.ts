import { createHash } from 'node:crypto';
import type { AuthContext } from '@/lib/auth';
import { assertActiveSession } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import { acquireTenantLifecycleLock } from '@/lib/tenant-lifecycle-lock';
import type { DbClient,UUID } from '@/shared/types';
import { ConflictError,ForbiddenError,NotFoundError,ValidationError } from '@/shared/errors';
import type { ReviewResolution } from '@/lib/contracts/account-offboarding';

export interface OffboardingReview {
  id:UUID;tenant_id:UUID;project_id:UUID;subject_user_id:UUID;local_event_id:UUID;reason:string;
  status:'PENDING'|'RESOLVED';created_at:string;disposition:string|null;tenant_event_id:UUID|null;
}
export async function authorizeOffboardingReview(db:DbClient,auth:AuthContext):Promise<void>{
  await assertActiveSession(db,auth);
  if(await getTenantRole(db,auth.tenantId,auth.userId,auth.sessionVersion)!=='TENANT_ADMIN')throw new ForbiddenError('Current Central IT authority is required');
}
export function reviewSnapshot(review:OffboardingReview):string{return createHash('sha256').update(JSON.stringify(review)).digest('hex');}
export async function readOffboardingReview(db:DbClient,auth:AuthContext,reviewId:UUID):Promise<{review:OffboardingReview;snapshot:string}>{
  await authorizeOffboardingReview(db,auth);
  const {rows}=await db.query<{review:OffboardingReview}>('SELECT to_jsonb(r) AS review FROM account_offboarding_reviews r WHERE r.tenant_id=$1 AND r.id=$2',[auth.tenantId,reviewId]);
  if(!rows[0])throw new NotFoundError('Offboarding review not found');
  return {review:rows[0].review,snapshot:reviewSnapshot(rows[0].review)};
}
/** Links a separate confirmed transition; never calls tenant disable implicitly. */
export async function resolveOffboardingReview(db:DbClient,auth:AuthContext,command:ReviewResolution):Promise<void>{
  await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
  const current=await readOffboardingReview(db,auth,command.reviewId);
  if(command.reason.length<10||command.reason.length>1000||command.reason!==command.reason.trim())throw new ValidationError('A reason of 10–1000 characters is required');
  if(current.review.status!=='PENDING'||current.snapshot!==command.snapshot)throw new ConflictError('Review changed; reload before resolving it','STALE_OFFBOARDING_REVIEW');
  if(command.disposition==='TENANT_ACCOUNT_DISABLED'){
    const {rows}=await db.query(`SELECT e.id FROM account_lifecycle_events e JOIN users u ON u.id=e.subject_user_id AND u.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1 AND e.id=$2 AND e.scope='TENANT_ACCOUNT' AND e.subject_user_id=$3 AND u.deactivated_at IS NOT NULL`,
      [auth.tenantId,command.tenantEventId,current.review.subject_user_id]);
    if(!rows[0])throw new ConflictError('Confirm a separate tenant account disable before linking its event','TENANT_DISABLE_REQUIRED');
  }else if(command.disposition!=='NO_FURTHER_ACTION'||command.tenantEventId!==null)throw new ValidationError('Invalid review disposition');
  const {rows}=await db.query(`UPDATE account_offboarding_reviews SET status='RESOLVED',resolved_at=NOW(),resolved_by=$3,
    disposition=$4,resolution_reason=$5,tenant_event_id=$6 WHERE tenant_id=$1 AND id=$2 AND status='PENDING' RETURNING id`,
    [auth.tenantId,command.reviewId,auth.userId,command.disposition,command.reason,command.tenantEventId]);
  if(!rows[0])throw new ConflictError('Review changed; reload before resolving it','STALE_OFFBOARDING_REVIEW');
}
