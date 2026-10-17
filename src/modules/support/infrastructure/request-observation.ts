import type {AuthContext} from '@/lib/auth';
import {requireActiveAuth} from '@/lib/auth';
import {resolveProjectCapabilities} from '@/lib/project-capabilities';
import {acquireTenantLifecycleLock} from '@/lib/tenant-lifecycle-lock';
import {Pool} from 'pg';
import type {NextRequest} from 'next/server';
import type {UUID} from '@/shared/types';
export interface RequestObservation {projectId:UUID;route:string;method:string;status:number;durationMs:number;correlationId:UUID;errorCode:string|null;ticketId:UUID|null;priorStatus:string|null}
let observationPool:Pool|undefined;
/** Server-authenticated metadata only; failures never change the business response. */
export async function recordRequestObservation(req:NextRequest,expected:AuthContext,input:RequestObservation){
 // A full business pool must not make best-effort telemetry wait indefinitely.
 observationPool??=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:300});
 const db=await observationPool.connect();
 try{
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='100ms'");await db.query("SET LOCAL statement_timeout='250ms'");
  await acquireTenantLifecycleLock(db,expected.tenantId,'SHARED');
  const auth=await requireActiveAuth(req,db),capability=await resolveProjectCapabilities(db,auth,input.projectId);
  if(auth.userId===expected.userId&&auth.tenantId===expected.tenantId&&(capability.operationalRole||capability.canAdminister))await db.query(`INSERT INTO project_request_observations(tenant_id,project_id,actor_id,route,method,status,duration_ms,correlation_id,error_code,ticket_id,prior_status)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[auth.tenantId,input.projectId,auth.userId,input.route,input.method,input.status,input.durationMs,input.correlationId,input.errorCode,input.ticketId,input.priorStatus]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
