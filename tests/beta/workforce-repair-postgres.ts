// Two-session authority checks on the repository-owned disposable workforce fixture.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {SurveyWorkforcePgRepository} from '../../src/modules/tenancy/infrastructure/survey-workforce.repository';
import {TenancyRepository} from '../../src/modules/tenancy/infrastructure/tenancy.repository';
import {assignAorUser,deactivateAorUserAssignment} from '../../src/modules/tenancy/application/assign-aor-user';
import {moveWorkforceMember} from '../../src/modules/tenancy/application/survey-workforce';
import {ConflictError,NotFoundError} from '../../src/shared/errors';
import type {DbClient,UUID} from '../../src/shared/types';
import type {TeamActor} from '../../src/modules/tenancy/application/survey-teams';
const id=(n:number)=>`96000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const actor:TeamActor={tenantId:id(1),projectId:id(3),actorId:id(12),actorRole:'SURVEY_SUPERINTENDENT',sessionVersion:1};
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const pg=new Pool({connectionString:url.href,max:4});let checks=0;
 const check=(actual:unknown,expected:unknown,message?:string)=>{assert.deepEqual(actual,expected,message);checks++;};
 const events=async()=>Number((await pg.query('SELECT count(*) AS n FROM survey_staffing_events WHERE project_id=$1',[actor.projectId])).rows[0].n);
 const history=async()=> (await pg.query("SELECT md5(string_agg(to_jsonb(t)::text,',' ORDER BY id)) AS hash FROM tickets t WHERE project_id=$1",[actor.projectId])).rows[0].hash;
 try{
 check((await pg.query('SELECT name FROM tenants WHERE id=$1',[actor.tenantId])).rows[0]?.name,'Increment');
 const assignments=(await pg.query('SELECT id FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL',[actor.tenantId,actor.projectId,actor.actorId])).rows;check(assignments.length,1);
 const grant=assignments[0].id;
 for(const kind of ['grant','node'] as const){
  const transfer=await pg.connect(),revoker=await pg.connect();
  const transferPid=(await transfer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const revokerPid=(await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const oldChief=(await pg.query('SELECT party_chief_id FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2 AND deactivated_at IS NULL',[actor.projectId,id(17)])).rows[0].party_chief_id;
  const target=oldChief===id(14)?id(24):id(14),beforeEvents=await events(),beforeHistory=await history();
  let revoked:Promise<void>|undefined,finished=false,revocationError:unknown;
  class PausedRepository extends SurveyWorkforcePgRepository{
   override async move(db:DbClient,current:TeamActor,im:UUID,chief:UUID){
    revoked=(async()=>{
     await revoker.query('BEGIN');await revoker.query("SET LOCAL statement_timeout='8000ms'");
     if(kind==='grant')await deactivateAorUserAssignment(new TenancyRepository(),revoker,{tenantId:actor.tenantId,projectId:actor.projectId,assignmentId:grant,actorRole:'PROJECT_ADMIN'});
     else await revoker.query('UPDATE aor_nodes SET retired_at=now() WHERE tenant_id=$1 AND project_id=$2 AND id=$3',[actor.tenantId,actor.projectId,id(30)]);
     await revoker.query('COMMIT');
    })();
    void revoked.then(()=>{finished=true;},error=>{finished=true;revocationError=error;});
    let blocked=false;const deadline=Date.now()+3000;
    while(!finished&&Date.now()<deadline){
     const state=(await pg.query("SELECT wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid)) AS blocked FROM pg_stat_activity WHERE pid=$1",[revokerPid,transferPid])).rows[0];
     if(state?.blocked){blocked=true;break;}
     await new Promise(resolve=>setTimeout(resolve,10));
    }
    check(blocked,true,`${kind} revocation must wait for the authorized transfer transaction`);
    check(finished,false,'Authority cannot disappear between snapshot validation and the roster write');
    await super.move(db,current,im,chief);
   }
  }
  const repo=new PausedRepository();
  try{
   const expectedSnapshot=(await repo.snapshot(pg,actor.tenantId,actor.projectId))!;
   await transfer.query('BEGIN');await transfer.query("SET LOCAL statement_timeout='8000ms'");
   check(await moveWorkforceMember(repo,transfer,actor,{instrumentManId:id(17),partyChiefId:target,expectedSnapshot}),{changed:true});
   await transfer.query('COMMIT');await revoked;if(revocationError)throw revocationError;
   check((await pg.query('SELECT party_chief_id FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2 AND deactivated_at IS NULL',[actor.projectId,id(17)])).rows[0].party_chief_id,target);
   check(await events(),beforeEvents+1);check(await history(),beforeHistory);
   // Once the winning revocation has committed, a later command cannot write or replay authority.
   const now=(await repo.snapshot(pg,actor.tenantId,actor.projectId))!;
   await transfer.query('BEGIN');await assert.rejects(moveWorkforceMember(new SurveyWorkforcePgRepository(),transfer,actor,{instrumentManId:id(17),partyChiefId:oldChief,expectedSnapshot:now}),NotFoundError);checks++;
   await transfer.query('ROLLBACK');check(await events(),beforeEvents+1);
  }finally{
   await transfer.query('ROLLBACK');if(revoked)await revoked.catch(()=>{});await revoker.query('ROLLBACK');
   await pg.query('UPDATE aor_assignments SET deactivated_at=NULL WHERE id=$1',[grant]);
   await pg.query('UPDATE aor_nodes SET retired_at=NULL WHERE tenant_id=$1 AND project_id=$2 AND id=$3',[actor.tenantId,actor.projectId,id(30)]);
   await pg.query('UPDATE crew_rosters SET party_chief_id=$3 WHERE project_id=$1 AND instrument_man_id=$2',[actor.projectId,id(17),oldChief]);
   transfer.release();revoker.release();
  }
 }
 // Replacement-first: the existing SETUP writer updates the old grant before
 // inserting its replacement. Its foreign-key checks must not deadlock with a transfer.
 const replacement=await pg.connect(),waitingTransfer=await pg.connect();
 const previousStatus=(await pg.query('SELECT status FROM projects WHERE id=$1',[actor.projectId])).rows[0].status;
 const oldChief=(await pg.query('SELECT party_chief_id FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2 AND deactivated_at IS NULL',[actor.projectId,id(17)])).rows[0].party_chief_id;
 let pending:Promise<unknown>|undefined,replacementId:UUID|undefined;
 try{
  await pg.query("UPDATE projects SET status='SETUP' WHERE id=$1",[actor.projectId]);
  const before=await events(),expectedSnapshot=(await new SurveyWorkforcePgRepository().snapshot(pg,actor.tenantId,actor.projectId))!;
  const replacementPid=(await replacement.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const waitingPid=(await waitingTransfer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  class PausedReplacement extends TenancyRepository{
   override async saveAorAssignment(db:DbClient,assignment:Parameters<TenancyRepository['saveAorAssignment']>[1]){
    replacementId=assignment.id;
    await waitingTransfer.query('BEGIN');await waitingTransfer.query("SET LOCAL statement_timeout='8000ms'");
    pending=moveWorkforceMember(new SurveyWorkforcePgRepository(),waitingTransfer,actor,{instrumentManId:id(17),partyChiefId:oldChief===id(14)?id(24):id(14),expectedSnapshot}).then(value=>value,error=>error);
    let blocked=false;const deadline=Date.now()+3000;
    while(Date.now()<deadline){
     const state=(await pg.query("SELECT wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid)) AS blocked FROM pg_stat_activity WHERE pid=$1",[waitingPid,replacementPid])).rows[0];
     if(state?.blocked){blocked=true;break;}
     await new Promise(resolve=>setTimeout(resolve,10));
    }
    check(blocked,true,'Transfer waits for the already-started grant replacement');
    await super.saveAorAssignment(db,assignment);
   }
  }
  await replacement.query('BEGIN');await replacement.query("SET LOCAL statement_timeout='8000ms'");
  await assignAorUser(new PausedReplacement(),replacement,{tenantId:actor.tenantId,projectId:actor.projectId,userId:actor.actorId,aorNodeId:id(30),actorRole:'PROJECT_ADMIN',deactivateAssignmentIds:[grant]});
  await replacement.query('COMMIT');
  const result=await pending;check(result instanceof ConflictError,true,`Replacement must yield STALE_STAFFING, received ${JSON.stringify(result)}`);
  check((result as ConflictError).code,'STALE_STAFFING');
  await waitingTransfer.query('ROLLBACK');check(await events(),before);
  check((await pg.query('SELECT party_chief_id FROM crew_rosters WHERE project_id=$1 AND instrument_man_id=$2 AND deactivated_at IS NULL',[actor.projectId,id(17)])).rows[0].party_chief_id,oldChief);
 }finally{
  await replacement.query('ROLLBACK');if(pending)await pending;await waitingTransfer.query('ROLLBACK');
  if(replacementId)await pg.query('DELETE FROM aor_assignments WHERE id=$1',[replacementId]);
  await pg.query('UPDATE aor_assignments SET deactivated_at=NULL WHERE id=$1',[grant]);
  await pg.query('UPDATE projects SET status=$2 WHERE id=$1',[actor.projectId,previousStatus]);
  replacement.release();waitingTransfer.release();
 }
 const repo=new SurveyWorkforcePgRepository();
 const page=await repo.personnel(pg,actor,{search:'INSTRUMENT_MAN 17',limit:10,offset:0}) as Awaited<ReturnType<typeof repo.personnel>> & {snapshotToken?:string};
 check(page.total,1);check(page.data.map(person=>person.userId),[id(17)]);
 check(typeof page.snapshotToken,'string','A personnel page must carry its displayed staffing snapshot');
 check(page.snapshotToken,await repo.snapshot(pg,actor.tenantId,actor.projectId));
 const empty=await repo.personnel(pg,actor,{search:'INSTRUMENT_MAN 17',limit:10,offset:1000}) as typeof page;
 check(empty.data,[]);check(empty.total,1);check(empty.snapshotToken,page.snapshotToken);
 console.log(`Workforce repair PostgreSQL checks passed: ${checks}`);
 }finally{await pg.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
