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
 assertMutationIdentity(current,expected);
 return current;
}
/** For entry points with an explicitly injected current-auth reader. */
export function assertMutationIdentity(current:AuthContext,expected:AuthContext):void{
 if(current.tenantId!==expected.tenantId||current.userId!==expected.userId||
    current.sessionVersion!==expected.sessionVersion||
    (current.expiresAt&&current.expiresAt.getTime()<=Date.now())){
  throw new UnauthorizedError('Mutation identity changed or expired','AUTH_SESSION_REVOKED');
 }
}
/** Coordinate an explicitly authenticated writer before current authority or domain reads. */
export async function coordinateAuthenticatedMutation(db:DbClient,req:NextRequest,expected:AuthContext,mode:Mode,readAuth:(req:NextRequest,db?:DbClient)=>AuthContext|Promise<AuthContext>=requireActiveAuth):Promise<void>{
 await acquireTenantLifecycleLock(db,expected.tenantId,mode);
 assertMutationIdentity(await readAuth(req,db),expected);
}
