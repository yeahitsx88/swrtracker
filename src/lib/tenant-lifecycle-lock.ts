import type {DbClient,UUID} from '@/shared/types';
import type {NextRequest} from 'next/server';
import {NotFoundError,UnauthorizedError} from '@/shared/errors';
import {requireActiveAuth,type AuthContext} from './auth';
type Mode='SHARED'|'EXCLUSIVE';
const heldLocks=new WeakMap<DbClient,{transactionId:string;tenantId:UUID;mode:Mode}>();
/** Caller owns a transaction on one client. No domain/replay locks may precede this tenant barrier. */
export async function acquireTenantLifecycleLock(db:DbClient,tenantId:UUID,mode:Mode):Promise<void>{
 if(mode!=='SHARED'&&mode!=='EXCLUSIVE')throw new Error('Unknown tenant lifecycle lock mode');
 const transaction=(await db.query<{transaction_id:string}>('SELECT pg_current_xact_id()::text AS transaction_id')).rows[0];
 if(!transaction)throw new Error('Lifecycle transaction identity unavailable');
 const held=heldLocks.get(db);
 if(held?.transactionId===transaction.transaction_id){
  if(held.tenantId!==tenantId)throw new Error('One tenant lifecycle scope per transaction');
  if(held.mode==='SHARED'&&mode==='EXCLUSIVE')throw new Error('Tenant lifecycle lock upgrade is forbidden; select EXCLUSIVE before acquiring');
  return;
 }
 const {rows}=await db.query('SELECT id FROM tenants WHERE id=$1 FOR '+(mode==='SHARED'?'SHARE':'UPDATE'),[tenantId]);
 if(!rows[0])throw new NotFoundError('Tenant not found');
 heldLocks.set(db,{transactionId:transaction.transaction_id,tenantId,mode});
}
/** Repeat cookie/logout/current-account checks after the tenant lock wait, before any replay or write. */
export async function revalidateMutationAuth(db:DbClient,req:NextRequest,expected:AuthContext):Promise<AuthContext>{
 const current=await requireActiveAuth(req,db);
 if(current.tenantId!==expected.tenantId||current.userId!==expected.userId||current.sessionVersion!==expected.sessionVersion){
  throw new UnauthorizedError('Mutation identity changed','AUTH_SESSION_REVOKED');
 }
 return current;
}