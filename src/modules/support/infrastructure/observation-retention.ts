import type {Pool} from 'pg';
import type {DbClient,UUID} from '@/shared/types';
import {acquireTenantLifecycleLock} from '@/lib/tenant-lifecycle-lock';
import {logError} from '@/lib/observability';

/** Caller owns the transaction. A cycle removes at most 1,000 expired rows per tenant. */
export async function pruneTenantObservations(db:DbClient,tenantId:UUID,cutoff:Date):Promise<number>{
 await acquireTenantLifecycleLock(db,tenantId,'SHARED');
 const result=await db.query(`DELETE FROM project_request_observations observation
  USING (SELECT id FROM project_request_observations
   WHERE tenant_id=$1 AND observed_at<$2 ORDER BY observed_at,id
   LIMIT 1000 FOR UPDATE SKIP LOCKED) expired
  WHERE observation.tenant_id=$1 AND observation.id=expired.id RETURNING observation.id`,[tenantId,cutoff]);
 return result.rows.length;
}

/** Maintenance failure is logged per tenant; the next worker cycle retries it. */
export async function pruneExpiredRequestObservations(pool:Pool):Promise<void>{
 try{
  const cutoff=(await pool.query<{cutoff:Date}>("SELECT now()-interval '7 days' AS cutoff")).rows[0]!.cutoff;
  const tenants=await pool.query<{tenant_id:UUID}>('SELECT DISTINCT tenant_id FROM project_request_observations WHERE observed_at<$1',[cutoff]);
  for(const {tenant_id:tenantId}of tenants.rows){
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='100ms'");await db.query("SET LOCAL statement_timeout='2s'");
    await pruneTenantObservations(db,tenantId,cutoff);
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');logError('Request observation retention failed',{eventType:'diagnostics.retention_failed',tenantId,error_class:error instanceof Error?error.name:'UnknownError'});}
   finally{db.release();}
  }
 }catch(error){logError('Request observation retention cycle failed',{eventType:'diagnostics.retention_failed',error_class:error instanceof Error?error.name:'UnknownError'});}
}
