import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, Page, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { TeamActor, TeamPageQuery, TeamProjectContext } from './survey-teams';
export interface WorkforcePerson { userId:UUID; name:string; email:string; role:ProjectRole; partyChiefId:UUID|null }
export interface WorkforcePage extends Page<WorkforcePerson> { snapshotToken:string }
export interface WorkforceRepository {
 context(db:DbClient,actor:TeamActor):Promise<TeamProjectContext|null>;
 lockProject(db:DbClient,tenantId:UUID,projectId:UUID):Promise<TeamProjectContext|null>;
 lockActor(db:DbClient,actor:TeamActor):Promise<boolean>;
 lockSubjects(db:DbClient,tenantId:UUID,projectId:UUID,userIds:UUID[]):Promise<void>;
 lockTransferScope(db:DbClient,actor:TeamActor,instrumentManId:UUID):Promise<void>;
 snapshot(db:DbClient,tenantId:UUID,projectId:UUID):Promise<string|null>;
 person(db:DbClient,actor:TeamActor,userId:UUID):Promise<WorkforcePerson|null>;
 personnel(db:DbClient,actor:TeamActor,query:TeamPageQuery):Promise<WorkforcePage>;
 move(db:DbClient,actor:TeamActor,instrumentManId:UUID,partyChiefId:UUID):Promise<void>;
 record(db:DbClient,actor:TeamActor,payload:Record<string,unknown>):Promise<void>;
}
export interface WorkforceMove { instrumentManId:UUID; partyChiefId:UUID; expectedSnapshot:string }
export function assertWorkforceViewer(actor:TeamActor):void {
 if(!['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(actor.actorRole))throw new ForbiddenError('Your project role does not grant Team Management access');
}
export async function readWorkforceMember(repo:WorkforceRepository,db:DbClient,actor:TeamActor,userId:UUID){
 assertWorkforceViewer(actor);
 const person=await repo.person(db,actor,userId);
 if(!person)throw new NotFoundError('Assigned survey member not found');
 return person;
}
/** Check current authority and both subjects even on an idempotent replay. Caller owns the transaction. */
export async function authorizeWorkforceMove(repo:WorkforceRepository,db:DbClient,actor:TeamActor,input:WorkforceMove){
 if(actor.actorRole!=='SURVEY_SUPERINTENDENT')throw new ForbiddenError('Only a Superintendent may reorganize their assigned workforce here');
 const project=await repo.lockProject(db,actor.tenantId,actor.projectId);
 if(!project)throw new NotFoundError('Project not found');
 if(!await repo.lockActor(db,actor))throw new ForbiddenError('Your project assignment or session has changed');
 if(project.status==='ARCHIVED')throw new ConflictError('Closed projects cannot be staffed');
 await repo.lockSubjects(db,actor.tenantId,actor.projectId,[input.instrumentManId,input.partyChiefId].sort());
 await repo.lockTransferScope(db,actor,input.instrumentManId);
 const instrument=await readWorkforceMember(repo,db,actor,input.instrumentManId);
 const chief=await readWorkforceMember(repo,db,actor,input.partyChiefId);
 if(instrument.role!=='INSTRUMENT_MAN'||!instrument.partyChiefId||chief.role!=='PARTY_CHIEF')throw new NotFoundError('Assigned survey member not found');
 return {instrument,chief};
}
export async function moveWorkforceMember(repo:WorkforceRepository,db:DbClient,actor:TeamActor,input:WorkforceMove){
 if(!/^[a-f0-9]{32}$/.test(input.expectedSnapshot))throw new ValidationError('Current staffing snapshot is required');
 const {instrument,chief}=await authorizeWorkforceMove(repo,db,actor,input);
 if(await repo.snapshot(db,actor.tenantId,actor.projectId)!==input.expectedSnapshot)throw new ConflictError('Staffing changed; reload before saving','STALE_STAFFING');
 if(instrument.partyChiefId===chief.userId)return {changed:false};
 // A transfer preserves the authorized pool: the old and new Chiefs both still report to this Superintendent.
 await repo.move(db,actor,instrument.userId,chief.userId);
 await repo.record(db,actor,{action:'reorganize-roster',instrumentManId:instrument.userId,partyChiefId:chief.userId,previousPartyChiefId:instrument.partyChiefId});
 return {changed:true};
}
