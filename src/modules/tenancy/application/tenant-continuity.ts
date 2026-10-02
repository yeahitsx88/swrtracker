import {ConflictError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import {acquireTenantLifecycleLock} from '@/lib/tenant-lifecycle-lock';
/** Caller owns the transaction; choose EXCLUSIVE before any domain lock. */
export async function assertCentralITRemovalSafe(db:DbClient,tenantId:UUID,subjectUserId:UUID):Promise<void>{
 await acquireTenantLifecycleLock(db,tenantId,'EXCLUSIVE');
 const {rows}=await db.query<{user_id:UUID}>(
  `SELECT tm.user_id FROM tenant_memberships tm
   JOIN users u ON u.id=tm.user_id AND u.tenant_id=tm.tenant_id
   JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
   WHERE tm.tenant_id=$1 AND tm.role='TENANT_ADMIN' AND u.deactivated_at IS NULL
     AND c.type IN ('GC','OWNER_REP')`,[tenantId]);
 if(rows.some(row=>row.user_id===subjectUserId)&&rows.length===1){
  throw new ConflictError('At least one active eligible Central IT administrator must remain','LAST_TENANT_ADMIN');
 }
}