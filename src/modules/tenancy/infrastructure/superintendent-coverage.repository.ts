import type {AuthContext} from '@/lib/auth';
import {assertPreparationNotCancelling} from '@/lib/recommissioning-gate';
import {ConflictError,ForbiddenError,NotFoundError,UnauthorizedError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {CoverageAuthority,CoverageGrantContext,CoverageScope,GrantSuperintendentAreaInput,GrantSuperintendentAreaResult,SuperintendentCoverageRepository,SuperintendentCoverageReview} from '../application/grant-superintendent-area';
import type {IndividualAssignmentEvidence,ResolutionArea,ResolutionPerson,ResponsibilityGrantEvidence} from '../application/protected-obligations.types';
import {ProtectedObligationsPgRepository} from './protected-obligations.repository';
import {SuperintendentAreasPgRepository} from './superintendent-areas.repository';

const assignmentColumns=`id,user_id AS "userId",aor_node_id AS "areaId",created_at::text AS "createdAt",deactivated_at::text AS "deactivatedAt"`;
const grantColumns=`id,user_id AS "userId",aor_node_id AS "areaId",responsibility,granted_by AS "grantedBy",granted_at::text AS "grantedAt",revoked_at::text AS "revokedAt"`;

export class SuperintendentCoveragePgRepository implements SuperintendentCoverageRepository{
 private readonly areas=new SuperintendentAreasPgRepository();
 private readonly coverage=new ProtectedObligationsPgRepository();

 private async managerAuthority(db:DbClient,auth:AuthContext,projectId:UUID,editable:boolean):Promise<CoverageAuthority>{
  const {rows}=await db.query<{status:CoverageAuthority['project']['status'];crewBuild:CoverageAuthority['project']['crewBuild'];membershipId:UUID|null;role:string|null;companyId:UUID;companyType:string;sessionVersion:number;deactivatedAt:string|null;accessDisabledAt:string|null}>(
   `SELECT p.status,p.crew_build AS "crewBuild",pm.id AS "membershipId",pm.role,u.company_id AS "companyId",c.type AS "companyType",u.session_version AS "sessionVersion",u.deactivated_at::text AS "deactivatedAt",pm.access_disabled_at::text AS "accessDisabledAt"
    FROM projects p JOIN users u ON u.tenant_id=p.tenant_id AND u.id=$3 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id
    LEFT JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=u.id WHERE p.tenant_id=$1 AND p.id=$2`,[auth.tenantId,projectId,auth.userId]);
  const row=rows[0];
  if(!row)throw new NotFoundError('Project not found');
  if(row.deactivatedAt||row.sessionVersion!==auth.sessionVersion||(auth.expiresAt&&auth.expiresAt.getTime()<=Date.now()))throw new UnauthorizedError('Current active session is required','AUTH_SESSION_REVOKED');
  if(row.accessDisabledAt||row.role!=='SURVEY_MANAGER'||row.companyType==='SUBCONTRACTOR'||!row.membershipId)throw new ForbiddenError('Current project Survey Manager is required');
  if(editable&&(row.status==='ARCHIVED'||row.crewBuild!=='FULL'))throw new ConflictError('Area coverage requires an editable FULL project');
  return{tenantId:auth.tenantId,projectId,actorId:auth.userId,actorMembershipId:row.membershipId,actorCompanyId:row.companyId,actorCompanyType:row.companyType,actorSessionVersion:row.sessionVersion,project:{status:row.status,crewBuild:row.crewBuild},expiresAt:auth.expiresAt};
 }

 async review(db:DbClient,auth:AuthContext,projectId:UUID,superintendentId:UUID):Promise<SuperintendentCoverageReview>{
  const authority=await this.managerAuthority(db,auth,projectId,false),scope=[auth.tenantId,projectId,superintendentId];
  const person=(await db.query<SuperintendentCoverageReview['person']>(
   `SELECT u.id AS "userId",u.name,u.email,pm.role,(u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL) AS active
    FROM project_memberships pm JOIN users u ON u.tenant_id=$1 AND u.id=pm.user_id WHERE pm.project_id=$2 AND pm.user_id=$3 AND pm.role='SURVEY_SUPERINTENDENT'`,scope)).rows[0];
  if(!person)throw new NotFoundError('Current scoped Superintendent not found');
  const {rows}=await db.query<{areaId:UUID;areaName:string;topLevel:boolean;assignmentId:UUID|null;reviewGrantId:UUID|null}>(
   `SELECT n.id AS "areaId",n.name AS "areaName",(l.depth=0 AND n.parent_id IS NULL AND n.retired_at IS NULL) AS "topLevel",
     (SELECT a.id FROM aor_assignments a WHERE a.tenant_id=$1 AND a.project_id=$2 AND a.user_id=$3 AND a.aor_node_id=n.id AND a.department_id IS NULL AND a.deactivated_at IS NULL ORDER BY a.created_at,a.id LIMIT 1) AS "assignmentId",
     (SELECT g.id FROM project_responsibility_grants g WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=$3 AND g.aor_node_id=n.id AND g.responsibility='SURVEY_REVIEWER' AND g.revoked_at IS NULL ORDER BY g.granted_at,g.id LIMIT 1) AS "reviewGrantId"
    FROM aor_nodes n JOIN aor_levels l ON l.id=n.level_id AND l.tenant_id=n.tenant_id AND l.project_id=n.project_id
    WHERE n.tenant_id=$1 AND n.project_id=$2 ORDER BY lower(n.name),n.id`,scope);
  const coveredAreas=rows.filter(r=>r.assignmentId||r.reviewGrantId).map(r=>({areaId:r.areaId,areaName:r.areaName,assignmentId:r.assignmentId,reviewGrantId:r.reviewGrantId,complete:!!(r.assignmentId&&r.reviewGrantId)}));
  const grantableAreas=rows.filter(r=>r.topLevel&&!(r.assignmentId&&r.reviewGrantId)).map(r=>({areaId:r.areaId,areaName:r.areaName}));
  return{project:authority.project,person,snapshotToken:await this.snapshot(db,{tenantId:auth.tenantId,projectId},superintendentId),coveredAreas,grantableAreas};
 }

 async lockGrantContext(db:DbClient,auth:AuthContext,projectId:UUID,input:GrantSuperintendentAreaInput):Promise<CoverageGrantContext>{
  const scope=[auth.tenantId,projectId];
  if(!(await db.query('SELECT id FROM projects WHERE tenant_id=$1 AND id=$2 FOR NO KEY UPDATE',scope)).rows[0])throw new NotFoundError('Project not found');
  await this.managerAuthority(db,auth,projectId,true);
  const users=[...new Set([auth.userId,input.superintendentId])].sort();
  const accounts=await db.query<{id:UUID}>('SELECT id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',[auth.tenantId,users]);
  if(accounts.rows.length!==users.length)throw new NotFoundError('Scoped person not found');
  const memberships=await db.query<{id:UUID}>('SELECT id FROM project_memberships WHERE project_id=$1 AND user_id=ANY($2::uuid[]) ORDER BY user_id,id FOR SHARE',[projectId,users]);
  await db.query('SELECT id FROM companies WHERE tenant_id=$1 AND id IN(SELECT company_id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[])) ORDER BY id FOR SHARE',[auth.tenantId,users]);
  await db.query('SELECT n.id FROM aor_nodes n WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.id=$3 FOR SHARE',[...scope,input.areaId]);
  await db.query('SELECT l.id FROM aor_levels l WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.id IN(SELECT level_id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$3) FOR SHARE',[...scope,input.areaId]);
  await db.query('SELECT id FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4 ORDER BY id FOR SHARE',[...scope,input.superintendentId,input.areaId]);
  await db.query('SELECT id FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4 ORDER BY id FOR SHARE',[...scope,input.superintendentId,input.areaId]);
  // Re-read authority after every wait: the actor may have changed while locks were pending.
  const authority=await this.managerAuthority(db,auth,projectId,true),heldMembershipIds=memberships.rows.map(row=>row.id);
  if(!heldMembershipIds.includes(authority.actorMembershipId))throw new ConflictError('Authorizing membership changed during validation');
  const subject=(await db.query<ResolutionPerson>(`SELECT u.id,u.company_id AS "companyId",c.type AS "companyType",u.session_version AS "sessionVersion",u.deactivated_at::text AS "deactivatedAt",pm.access_disabled_at::text AS "accessDisabledAt",pm.id AS "membershipId",pm.role
   FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id LEFT JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=u.id WHERE u.tenant_id=$1 AND u.id=$3`,[...scope,input.superintendentId])).rows[0];
  if(!subject)throw new NotFoundError('Scoped person not found');
  const area=(await db.query<ResolutionArea>(`SELECT n.id,n.name,n.level_id AS "levelId",l.depth,n.parent_id AS "parentId",n.retired_at::text AS "retiredAt" FROM aor_nodes n JOIN aor_levels l ON l.id=n.level_id AND l.tenant_id=n.tenant_id AND l.project_id=n.project_id WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.id=$3`,[...scope,input.areaId])).rows[0];
  if(!area)throw new NotFoundError('Scoped Area not found');
  const assignment=(await db.query<IndividualAssignmentEvidence>(`SELECT ${assignmentColumns} FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4 AND department_id IS NULL AND deactivated_at IS NULL ORDER BY created_at,id LIMIT 1`,[...scope,input.superintendentId,input.areaId])).rows[0]??null;
  const reviewGrant=(await db.query<ResponsibilityGrantEvidence>(`SELECT ${grantColumns} FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4 AND responsibility='SURVEY_REVIEWER' AND revoked_at IS NULL ORDER BY granted_at,id LIMIT 1`,[...scope,input.superintendentId,input.areaId])).rows[0]??null;
  return{authority,subject,area,assignment,reviewGrant,heldMembershipIds};
 }

 assertNotCancelling(db:DbClient,scope:CoverageScope){return assertPreparationNotCancelling(db,scope.tenantId,scope.projectId);}
 snapshot(db:DbClient,scope:CoverageScope,superintendentId:UUID){return this.areas.snapshot(db,scope,superintendentId);}
 createAssignment(db:DbClient,scope:CoverageScope,userId:UUID,areaId:UUID,id:UUID,at:string){return this.coverage.createIndividualCoverage(db,scope,userId,areaId,id,at);}
 createReviewGrant(db:DbClient,scope:CoverageScope,userId:UUID,areaId:UUID,actorId:UUID,id:UUID,at:string){return this.coverage.createReviewCoverage(db,scope,userId,areaId,actorId,id,at);}

 async recordGrant(db:DbClient,context:CoverageGrantContext,input:GrantSuperintendentAreaInput,result:GrantSuperintendentAreaResult,coverage:{assignment:IndividualAssignmentEvidence;reviewGrant:ResponsibilityGrantEvidence}):Promise<void>{
  const {authority}=context;
  const evidence={version:1,action:'grant-superintendent-area',kind:'SUPERINTENDENT_AREA_GRANT',correlationId:result.eventId,confirmedAt:result.grantedAt,confirmGrant:true,coverageRule:'EXACT_AREA',
   reason:input.reason,subject:context.subject,area:context.area,assignment:coverage.assignment,reviewGrant:coverage.reviewGrant,
   individualAssignmentProvenance:result.createdIndividualAssignment?'CREATED':'REUSED',reviewGrantProvenance:result.createdReviewGrant?'CREATED':'REUSED',
   expectedSnapshot:input.expectedSnapshot,project:authority.project,
   authority:{branch:'PROJECT_SURVEY_MANAGER',membership:{id:authority.actorMembershipId,tenantId:authority.tenantId,projectId:authority.projectId,userId:authority.actorId,role:'SURVEY_MANAGER'},account:{userId:authority.actorId,active:true,sessionVersion:authority.actorSessionVersion},company:{id:authority.actorCompanyId,type:authority.actorCompanyType}},
   heldMembershipIds:context.heldMembershipIds};
  await db.query(`INSERT INTO survey_staffing_events(id,tenant_id,project_id,actor_id,event_type,payload,created_at) VALUES($1,$2,$3,$4,'survey.staffing_saved',$5,$6)`,[result.eventId,authority.tenantId,authority.projectId,authority.actorId,evidence,result.grantedAt]);
  // Decision27/28: a new review grant carries its access event; an assignment-only addition invents none.
  if(result.createdReviewGrant)await db.query(`INSERT INTO access_grant_events(id,tenant_id,project_id,company_id,subject_user_id,actor_id,action,grant_id,occurred_at,resolution_evidence) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'RESPONSIBILITY_GRANTED',$6,$7,$8)`,[authority.tenantId,authority.projectId,context.subject.companyId,context.subject.id,authority.actorId,coverage.reviewGrant.id,result.grantedAt,evidence]);
 }
}
