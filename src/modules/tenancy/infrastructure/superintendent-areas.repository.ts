import type {AreaUnlinkAuthority,AreaUnlinkContext,UnlinkSuperintendentAreaInput,UnlinkSuperintendentAreaResult} from '../application/superintendent-area.types';
import type {ResolutionPerson,ResolutionArea,IndividualAssignmentEvidence,ResponsibilityGrantEvidence} from '../application/protected-obligations.types';
import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import {ConflictError,ForbiddenError,NotFoundError,UnauthorizedError} from '@/shared/errors';
import {snapshotCte} from './survey-staffing.repository';
import type {SuperintendentAreaReadQuery,SuperintendentAreaReadResult,AreaUnlinkScope} from '../application/superintendent-area.types';
// Shared by every mode and the fresh command: no selected-link/search/page input
// changes this canonical subject state. Incumbent staffing checksum is unchanged.
const stateCte=`${snapshotCte}, project_nodes AS (
 SELECT n.*,l.depth FROM aor_nodes n JOIN aor_levels l ON l.id=n.level_id AND l.tenant_id=n.tenant_id AND l.project_id=n.project_id
 WHERE n.tenant_id=$1 AND n.project_id=$2
), subject_assignments AS (
 SELECT * FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND department_id IS NULL
), tree(root_id,id) AS (
 SELECT DISTINCT a.aor_node_id,n.id FROM subject_assignments a JOIN project_nodes n ON n.id=a.aor_node_id
 UNION SELECT t.root_id,n.id FROM tree t JOIN project_nodes n ON n.parent_id=t.id
), people AS (
 SELECT u.id AS "userId",u.name,u.email,pm.role,pm.id AS "membershipId",pm.created_at AS "membershipCreatedAt",u.company_id AS "companyId",c.type AS "companyType",u.session_version AS "sessionVersion",u.deactivated_at AS "deactivatedAt"
 FROM project_memberships pm JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1 JOIN companies c ON c.id=u.company_id AND c.tenant_id=$1 WHERE pm.project_id=$2
), cleanup_snapshot AS (SELECT md5(jsonb_build_object(
 'subject',$3::uuid,'staffing',(SELECT token FROM snapshot),
 'nodes',COALESCE((SELECT jsonb_agg(n ORDER BY id) FROM project_nodes n),'[]'),
 'people',COALESCE((SELECT jsonb_agg(p ORDER BY "userId") FROM people p),'[]'),
 'assignments',COALESCE((SELECT jsonb_agg(jsonb_build_array(id,user_id,aor_node_id,department_id,created_at,deactivated_at) ORDER BY id) FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2),'[]'),
 'responsibility',COALESCE((SELECT jsonb_agg(g ORDER BY id) FROM project_responsibility_grants g WHERE tenant_id=$1 AND project_id=$2),'[]'),
 'acting',COALESCE((SELECT jsonb_agg(g ORDER BY id) FROM acting_grants g WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3),'[]'),
 'departments',COALESCE((SELECT jsonb_agg(d ORDER BY id) FROM department_memberships d WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3),'[]'),
 'coverageEvents',COALESCE((SELECT jsonb_agg(jsonb_build_array(e.id,e.occurred_at,e.resolution_evidence) ORDER BY e.id) FROM access_grant_events e WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.resolution_evidence IS NOT NULL AND (e.subject_user_id=$3 OR e.subject_user_id IN (SELECT "userId" FROM people WHERE role='SURVEY_SUPERINTENDENT'))),'[]')
 )::text) AS token)`;
const accessCte=`subject AS (SELECT * FROM people WHERE "userId"=$3 AND role='SURVEY_SUPERINTENDENT' AND "companyType"<>'SUBCONTRACTOR'),
 selected AS (SELECT * FROM subject_assignments WHERE id=$8::uuid AND deactivated_at IS NULL),
 current_actor AS (SELECT * FROM people WHERE "userId"=$4::uuid)`;
const projectJson="(SELECT jsonb_build_object('status',status,'crewBuild',crew_build) FROM projects WHERE tenant_id=$1 AND id=$2)";
const personJson=`(SELECT jsonb_build_object('userId',"userId",'name',name,'email',email,'role',role,'active',"deactivatedAt" IS NULL) FROM subject)`;
export class SuperintendentAreasPgRepository{
 async snapshot(db:DbClient,scope:AreaUnlinkScope,superintendentId:UUID):Promise<string>{
  const {rows}=await db.query<{token:string}>(`WITH RECURSIVE ${stateCte} SELECT token FROM cleanup_snapshot`,[scope.tenantId,scope.projectId,superintendentId]);
  return rows[0]!.token;
 }
 async readPage(db:DbClient,auth:AuthContext,projectId:UUID,input:SuperintendentAreaReadQuery):Promise<SuperintendentAreaReadResult>{
  const q=input.query,parameters=[auth.tenantId,projectId,input.superintendentId,auth.userId,`%${q.search}%`,q.limit,q.offset,'linkId' in input?input.linkId:null,auth.sessionVersion,auth.expiresAt??null];
  let matching:string,pageKey:string,order:string;
  if(input.mode==='superintendent-areas'){
   pageKey='assignments';order='"assignmentId"';
   matching=`obligations AS (
    SELECT aa.id AS "assignmentId",n.id AS "areaId",n.name AS "areaName",aa.created_at AS "createdAt",n.retired_at IS NOT NULL AS retired,n.depth,n.parent_id AS "parentId",
    (SELECT count(*)::int FROM subject_assignments a WHERE a.id<>aa.id AND a.aor_node_id=aa.aor_node_id AND a.deactivated_at IS NULL) AS "duplicateIndividualCount",
    (SELECT count(*)::int FROM subject_assignments a WHERE a.id<>aa.id AND a.aor_node_id<>aa.aor_node_id AND a.deactivated_at IS NULL AND EXISTS(SELECT 1 FROM tree t WHERE (t.root_id=aa.aor_node_id AND t.id=a.aor_node_id) OR(t.root_id=a.aor_node_id AND t.id=aa.aor_node_id))) AS "overlappingIndividualCount",
    (SELECT count(*)::int FROM project_responsibility_grants g WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=$3 AND g.revoked_at IS NULL AND(g.aor_node_id IS NULL OR g.aor_node_id IN (SELECT id FROM tree WHERE root_id=aa.aor_node_id))) AS "responsibilityCount",
    (SELECT count(*)::int FROM acting_grants g WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=$3 AND g.revoked_at IS NULL) AS "actingCount",
    (SELECT count(*)::int FROM survey_reporting_links r WHERE r.tenant_id=$1 AND r.project_id=$2 AND r.superintendent_id=$3 AND r.deactivated_at IS NULL AND r.aor_node_id IN (SELECT id FROM tree WHERE root_id=aa.aor_node_id)) AS "reportingCount",
    EXISTS(SELECT 1 FROM people c JOIN project_responsibility_grants g ON g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=c."userId" AND g.aor_node_id=aa.aor_node_id AND g.responsibility='SURVEY_REVIEWER' AND g.revoked_at IS NULL JOIN aor_assignments a ON a.tenant_id=$1 AND a.project_id=$2 AND a.user_id=c."userId" AND a.aor_node_id=aa.aor_node_id AND a.department_id IS NULL AND a.deactivated_at IS NULL WHERE c."userId"<>$3 AND c.role='SURVEY_SUPERINTENDENT' AND c."companyType"<>'SUBCONTRACTOR' AND c."deactivatedAt" IS NULL) AS covered
    FROM subject_assignments aa JOIN project_nodes n ON n.id=aa.aor_node_id WHERE aa.deactivated_at IS NULL
   ), reasons AS (SELECT o.*,CASE WHEN p.status='ARCHIVED' THEN 'Archived project is read-only' WHEN p.crew_build<>'FULL' THEN 'Requires a FULL build' WHEN s."deactivatedAt" IS NOT NULL THEN 'Inactive Superintendent requires separate lifecycle resolution' WHEN depth<>0 OR "parentId" IS NOT NULL OR retired THEN 'Requires a live top-level Area' WHEN "responsibilityCount">0 OR "actingCount">0 THEN 'Resolve protected responsibility or acting obligations first' WHEN "reportingCount">0 THEN 'Resolve dependent Chief reporting links first' WHEN NOT covered THEN 'Establish complete exact-Area replacement coverage first' ELSE NULL END AS "refusalReason" FROM obligations o CROSS JOIN subject s JOIN projects p ON p.tenant_id=$1 AND p.id=$2),
   matching AS (SELECT "assignmentId","areaId","areaName","createdAt",retired,depth,"parentId","duplicateIndividualCount","overlappingIndividualCount","responsibilityCount","actingCount","reportingCount","refusalReason","refusalReason" IS NULL AS "canUnlink" FROM reasons WHERE "areaName" ILIKE $5)`;
  }else if(input.mode==='superintendent-area-replacements'){
   pageKey='replacements';order='lower(name),"userId"';
   matching=`matching AS (SELECT c."userId",c.name,c.email,g.id AS "replacementGrantId",a.id AS "replacementAssignmentId" FROM people c CROSS JOIN selected s
    JOIN LATERAL(SELECT id FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=c."userId" AND aor_node_id=s.aor_node_id AND responsibility='SURVEY_REVIEWER' AND revoked_at IS NULL ORDER BY id LIMIT 1)g ON true
    JOIN LATERAL(SELECT id FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=c."userId" AND aor_node_id=s.aor_node_id AND department_id IS NULL AND deactivated_at IS NULL ORDER BY id LIMIT 1)a ON true
    WHERE c."userId"<>$3 AND c.role='SURVEY_SUPERINTENDENT' AND c."companyType"<>'SUBCONTRACTOR' AND c."deactivatedAt" IS NULL AND(c.name ILIKE $5 OR c.email ILIKE $5))`;
  }else{
   pageKey='reporting';order='lower(name),"linkId"';
   matching=`matching AS (SELECT r.id AS "linkId",r.party_chief_id AS "partyChiefId",u.name,u.email,pm.role,u.deactivated_at IS NULL AS active,n.id AS "areaId",n.name AS "areaName",n.retired_at IS NOT NULL AS retired,
    COALESCE((u.deactivated_at IS NULL AND pm.role='PARTY_CHIEF' AND c.type<>'SUBCONTRACTOR' AND p.status<>'ARCHIVED' AND p.crew_build<>'SLIM'),false) AS "canUseStaffing",
    CASE WHEN u.deactivated_at IS NOT NULL OR pm.role IS DISTINCT FROM 'PARTY_CHIEF' OR c.type='SUBCONTRACTOR' THEN 'Chief requires separate lifecycle resolution' WHEN p.status='ARCHIVED' OR p.crew_build='SLIM' THEN 'Current project staffing is read-only or unsupported' ELSE NULL END AS "refusalReason"
    FROM survey_reporting_links r CROSS JOIN selected s JOIN project_nodes n ON n.id=r.aor_node_id JOIN users u ON u.tenant_id=$1 AND u.id=r.party_chief_id JOIN companies c ON c.tenant_id=$1 AND c.id=u.company_id LEFT JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=u.id JOIN projects p ON p.tenant_id=$1 AND p.id=$2
    WHERE r.tenant_id=$1 AND r.project_id=$2 AND r.superintendent_id=$3 AND r.deactivated_at IS NULL AND r.aor_node_id IN(SELECT id FROM tree WHERE root_id=s.aor_node_id) AND(u.name ILIKE $5 OR u.email ILIKE $5 OR n.name ILIKE $5))`;
  }

  const diagnostics=input.mode==='superintendent-areas'?`, 'departmentMembershipCount',(SELECT count(*) FROM department_memberships WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL),'sharedDepartmentAssignmentCount',(SELECT count(*) FROM aor_assignments a WHERE a.tenant_id=$1 AND a.project_id=$2 AND a.deactivated_at IS NULL AND a.department_id IN(SELECT department_id FROM department_memberships WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL))`:'';
  const {rows}=await db.query<{actorCurrent:boolean;projectExists:boolean;allowed:boolean;subjectExists:boolean;selectedExists:boolean;selectedSupported:boolean;result:SuperintendentAreaReadResult}>(`WITH RECURSIVE ${stateCte},${accessCte},${matching}
   SELECT EXISTS(SELECT 1 FROM users WHERE tenant_id=$1 AND id=$4 AND deactivated_at IS NULL AND session_version=$9 AND($10::timestamptz IS NULL OR clock_timestamp()<$10::timestamptz)) AS "actorCurrent",
   EXISTS(SELECT 1 FROM projects WHERE tenant_id=$1 AND id=$2) AS "projectExists",
   EXISTS(SELECT 1 FROM current_actor WHERE role='SURVEY_MANAGER' AND "companyType"<>'SUBCONTRACTOR') AS allowed,
   EXISTS(SELECT 1 FROM subject) AS "subjectExists",EXISTS(SELECT 1 FROM selected) AS "selectedExists",
   EXISTS(SELECT 1 FROM selected s JOIN project_nodes n ON n.id=s.aor_node_id WHERE n.depth=0 AND n.parent_id IS NULL AND n.retired_at IS NULL) AS "selectedSupported",
   jsonb_build_object('mode',$11::text,'project',${projectJson},'person',${personJson},'snapshotToken',(SELECT token FROM cleanup_snapshot),
   '${pageKey}',jsonb_build_object('data',COALESCE((SELECT jsonb_agg(m ORDER BY ${order}) FROM(SELECT * FROM matching ORDER BY ${order} LIMIT $6 OFFSET $7)m),'[]'),'total',(SELECT count(*) FROM matching),'limit',$6::int,'offset',$7::bigint)${diagnostics}) AS result`,[...parameters,input.mode]);
  const row=rows[0]!;
  if(!row.actorCurrent)throw new UnauthorizedError('Current active session is required','AUTH_SESSION_REVOKED');
  if(!row.projectExists)throw new NotFoundError('Project not found');
  if(!row.allowed)throw new ForbiddenError('Current project Survey Manager is required');
  if(!row.subjectExists)throw new NotFoundError('Current scoped Superintendent not found');
  if(input.mode!=='superintendent-areas'&&!row.selectedExists)throw new NotFoundError('Scoped active individual assignment not found');
  if(input.mode==='superintendent-area-replacements'&&!row.selectedSupported)throw new ConflictError('Replacement selection requires a live top-level Area');
  return row.result;
 }


 private async readManagerAuthority(db:DbClient,auth:AuthContext,projectId:UUID):Promise<AreaUnlinkAuthority>{
  const {rows}=await db.query<{status:AreaUnlinkAuthority['project']['status'];crewBuild:AreaUnlinkAuthority['project']['crewBuild'];membershipId:UUID|null;role:string|null;companyId:UUID;companyType:string;sessionVersion:number;deactivatedAt:string|null}>(`SELECT p.status,p.crew_build AS "crewBuild",pm.id AS "membershipId",pm.role,u.company_id AS "companyId",c.type AS "companyType",u.session_version AS "sessionVersion",u.deactivated_at::text AS "deactivatedAt"
   FROM projects p JOIN users u ON u.tenant_id=p.tenant_id AND u.id=$3 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id LEFT JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=u.id WHERE p.tenant_id=$1 AND p.id=$2`,[auth.tenantId,projectId,auth.userId]);
  const row=rows[0];
  if(!row||row.deactivatedAt||row.sessionVersion!==auth.sessionVersion||(auth.expiresAt&&auth.expiresAt.getTime()<=Date.now()))throw new UnauthorizedError('Current active session is required','AUTH_SESSION_REVOKED');
  if(row.role!=='SURVEY_MANAGER'||row.companyType==='SUBCONTRACTOR'||!row.membershipId)throw new ForbiddenError('Current project Survey Manager is required');
  if(row.status==='ARCHIVED'||row.crewBuild!=='FULL')throw new ConflictError('Current editable FULL project is required');
  return{tenantId:auth.tenantId,projectId,actorId:auth.userId,actorMembershipId:row.membershipId,actorCompanyId:row.companyId,actorCompanyType:row.companyType,actorSessionVersion:row.sessionVersion,project:{status:row.status,crewBuild:row.crewBuild},expiresAt:auth.expiresAt};
 }
 async lockUnlinkContext(db:DbClient,auth:AuthContext,projectId:UUID,input:UnlinkSuperintendentAreaInput):Promise<AreaUnlinkContext>{
  const scope=[auth.tenantId,projectId];
  if(!(await db.query('SELECT id FROM projects WHERE tenant_id=$1 AND id=$2 FOR NO KEY UPDATE',scope)).rows[0])throw new NotFoundError('Project not found');
  await this.readManagerAuthority(db,auth,projectId);
  const users=[...new Set([auth.userId,input.superintendentId,input.replacementUserId])].sort();
  const accounts=await db.query<{id:UUID}>('SELECT id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',[auth.tenantId,users]);
  if(accounts.rows.length!==users.length)throw new NotFoundError('Scoped person not found');
  const memberships=await db.query<{id:UUID}>('SELECT id FROM project_memberships WHERE project_id=$1 AND user_id=ANY($2::uuid[]) ORDER BY user_id,id FOR SHARE',[projectId,users]);
  await db.query('SELECT id FROM companies WHERE tenant_id=$1 AND id IN(SELECT company_id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[])) ORDER BY id FOR SHARE',[auth.tenantId,users]);
  const authority=await this.readManagerAuthority(db,auth,projectId),heldMembershipIds=memberships.rows.map(row=>row.id);
  if(!heldMembershipIds.includes(authority.actorMembershipId))throw new ConflictError('Authorizing membership changed during validation');
  const loadAssignment=async()=> (await db.query<IndividualAssignmentEvidence>(`SELECT id,user_id AS "userId",aor_node_id AS "areaId",created_at::text AS "createdAt",deactivated_at::text AS "deactivatedAt" FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND user_id=$4 AND department_id IS NULL`,[...scope,input.linkId,input.superintendentId])).rows[0];
  const original=await loadAssignment();if(!original)throw new NotFoundError('Scoped individual assignment not found');
  const tree=`WITH RECURSIVE subtree(id) AS(SELECT id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$3 UNION SELECT n.id FROM aor_nodes n JOIN subtree t ON n.parent_id=t.id WHERE n.tenant_id=$1 AND n.project_id=$2)`;
  await db.query(`${tree} SELECT n.id FROM aor_nodes n JOIN subtree t ON t.id=n.id WHERE n.tenant_id=$1 AND n.project_id=$2 ORDER BY n.id FOR SHARE OF n`,[...scope,original.areaId]);
  await db.query(`${tree} SELECT l.id FROM aor_levels l WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.id IN(SELECT n.level_id FROM aor_nodes n JOIN subtree t ON t.id=n.id WHERE n.tenant_id=$1 AND n.project_id=$2) ORDER BY l.id FOR SHARE`,[...scope,original.areaId]);
  for(const assignmentId of [...new Set([input.linkId,input.replacementAssignmentId])].sort())await db.query(`SELECT id FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND id=$3 FOR ${assignmentId===input.linkId?'NO KEY UPDATE':'SHARE'}`,[...scope,assignmentId]);
  const assignment=await loadAssignment();if(!assignment||assignment.areaId!==original.areaId)throw new ConflictError('Individual assignment scope changed');
  const subtreeIds=(await db.query<{id:UUID}>(`${tree} SELECT id FROM subtree ORDER BY id`,[...scope,assignment.areaId])).rows.map(row=>row.id);
  await db.query(`SELECT id FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND(id=$3 OR(user_id=$4 AND(aor_node_id IS NULL OR aor_node_id=ANY($5::uuid[])))) ORDER BY id FOR SHARE`,[...scope,input.replacementGrantId,input.superintendentId,subtreeIds]);
  await db.query('SELECT id FROM acting_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 ORDER BY id FOR SHARE',[...scope,input.superintendentId]);
  await db.query('SELECT id FROM survey_reporting_links WHERE tenant_id=$1 AND project_id=$2 AND superintendent_id=$3 AND aor_node_id=ANY($4::uuid[]) ORDER BY id FOR SHARE',[...scope,input.superintendentId,subtreeIds]);
  const people=(await db.query<ResolutionPerson>(`SELECT u.id,u.company_id AS "companyId",c.type AS "companyType",u.session_version AS "sessionVersion",u.deactivated_at::text AS "deactivatedAt",pm.id AS "membershipId",pm.role FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id LEFT JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=u.id WHERE u.tenant_id=$1 AND u.id=ANY($3::uuid[])`,[...scope,users])).rows;
  const area=(await db.query<ResolutionArea>(`SELECT n.id,n.name,n.level_id AS "levelId",l.depth,n.parent_id AS "parentId",n.retired_at::text AS "retiredAt" FROM aor_nodes n JOIN aor_levels l ON l.id=n.level_id AND l.tenant_id=n.tenant_id AND l.project_id=n.project_id WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.id=$3`,[...scope,assignment.areaId])).rows[0];
  if(!area)throw new NotFoundError('Scoped Area not found');
  const replacementGrant=(await db.query<ResponsibilityGrantEvidence>(`SELECT id,user_id AS "userId",aor_node_id AS "areaId",responsibility,granted_by AS "grantedBy",granted_at::text AS "grantedAt",revoked_at::text AS "revokedAt" FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND user_id=$4`,[...scope,input.replacementGrantId,input.replacementUserId])).rows[0]??null;
  const replacementAssignment=(await db.query<IndividualAssignmentEvidence>(`SELECT id,user_id AS "userId",aor_node_id AS "areaId",created_at::text AS "createdAt",deactivated_at::text AS "deactivatedAt" FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND user_id=$4 AND department_id IS NULL`,[...scope,input.replacementAssignmentId,input.replacementUserId])).rows[0]??null;
  const reportingLinkIds=(await db.query<{id:UUID}>('SELECT id FROM survey_reporting_links WHERE tenant_id=$1 AND project_id=$2 AND superintendent_id=$3 AND deactivated_at IS NULL AND aor_node_id=ANY($4::uuid[]) ORDER BY id',[...scope,input.superintendentId,subtreeIds])).rows.map(row=>row.id);
  const responsibilityGrantIds=(await db.query<{id:UUID}>('SELECT id FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL AND(aor_node_id IS NULL OR aor_node_id=ANY($4::uuid[])) ORDER BY id',[...scope,input.superintendentId,subtreeIds])).rows.map(row=>row.id);
  const actingGrantIds=(await db.query<{id:UUID}>('SELECT id FROM acting_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL ORDER BY id',[...scope,input.superintendentId])).rows.map(row=>row.id);
  return{authority,subject:people.find(p=>p.id===input.superintendentId)!,replacement:people.find(p=>p.id===input.replacementUserId)!,assignment,area,replacementGrant,replacementAssignment,subtreeIds,reportingLinkIds,responsibilityGrantIds,actingGrantIds,heldMembershipIds};
 }

 async deactivateAssignment(db:DbClient,scope:AreaUnlinkScope,input:UnlinkSuperintendentAreaInput,at:string):Promise<boolean>{
  const {rows}=await db.query('UPDATE aor_assignments SET deactivated_at=$5 WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND user_id=$4 AND department_id IS NULL AND deactivated_at IS NULL RETURNING id',[scope.tenantId,scope.projectId,input.linkId,input.superintendentId,at]);return rows.length===1;
 }
 async recordUnlink(db:DbClient,context:AreaUnlinkContext,input:UnlinkSuperintendentAreaInput,result:UnlinkSuperintendentAreaResult):Promise<void>{
  const {authority}=context;
  const payload={version:1,action:'unlink-superintendent-area',correlationId:result.unlinkEventId,confirmedAt:result.unlinkedAt,previousAssignment:context.assignment,subject:context.subject,replacement:{identity:context.replacement,grant:context.replacementGrant,assignment:context.replacementAssignment,provenance:'reused'},area:context.area,subtreeIds:context.subtreeIds,verifiedAbsence:{reportingCount:context.reportingLinkIds.length,responsibilityCount:context.responsibilityGrantIds.length,actingCount:context.actingGrantIds.length},expectedSnapshot:input.expectedSnapshot,confirmUnlink:true,authority:{...authority,role:'SURVEY_MANAGER',active:true},heldMembershipIds:context.heldMembershipIds,preservation:{roles:true,accounts:true,requests:true,otherAreas:true,crews:true,departments:true}};
  await db.query(`INSERT INTO survey_staffing_events(id,tenant_id,project_id,actor_id,event_type,payload,created_at) VALUES($1,$2,$3,$4,'survey.staffing_saved',$5,$6)`,[result.unlinkEventId,authority.tenantId,authority.projectId,authority.actorId,payload,result.unlinkedAt]);
 }
}
