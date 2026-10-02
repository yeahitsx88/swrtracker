import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import {assertActiveSession} from '@/lib/auth';
import {ConflictError,ForbiddenError,NotFoundError,UnauthorizedError} from '@/shared/errors';
import type {ProtectedObligationsRepository,ProtectedReadQuery,ProtectedReadResult,ProtectedScope,ResolutionAuthority,ResolutionContext,ResolutionPerson,ResolutionArea,ResolveReviewerInput,ResolveReviewerResult,ResponsibilityGrantEvidence,IndividualAssignmentEvidence} from '../application/protected-obligations.types';
const editable="('VIEWER','REQUESTER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')";
// Every read page and checksum below use one statement snapshot. The checksum
// deliberately ignores search/offset and includes candidates without coverage.
const accessCte=`current_access AS (
 SELECT $8::uuid AS selected_grant_id,CASE WHEN tm.id IS NOT NULL THEN 'CENTRAL_IT' WHEN pag.id IS NOT NULL THEN 'PROJECT_IT' ELSE 'SURVEY_MANAGER' END AS branch
 FROM projects p JOIN users u ON u.tenant_id=p.tenant_id AND u.id=$4 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id
 LEFT JOIN tenant_memberships tm ON tm.tenant_id=p.tenant_id AND tm.user_id=u.id AND tm.role='TENANT_ADMIN' AND c.type IN ('GC','OWNER_REP')
 LEFT JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=u.id
 LEFT JOIN project_admin_grants pag ON pag.tenant_id=p.tenant_id AND pag.project_id=p.id AND pag.user_id=u.id AND pag.revoked_at IS NULL AND pm.access_disabled_at IS NULL AND pm.id IS NOT NULL AND c.type IN ('GC','OWNER_REP')
 WHERE p.tenant_id=$1 AND p.id=$2 AND u.deactivated_at IS NULL AND u.session_version=$9 AND ($10::timestamptz IS NULL OR clock_timestamp()<$10::timestamptz)
 AND (tm.id IS NOT NULL OR pag.id IS NOT NULL OR (pm.role='SURVEY_MANAGER' AND pm.access_disabled_at IS NULL AND c.type<>'SUBCONTRACTOR'))
)`;
const stateCte=`subject_grants AS (
 SELECT * FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3
), areas AS (
 SELECT n.*,l.depth FROM aor_nodes n JOIN aor_levels l ON l.id=n.level_id AND l.tenant_id=n.tenant_id AND l.project_id=n.project_id
 WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.id IN (SELECT aor_node_id FROM subject_grants)
), people AS (
 SELECT u.id AS "userId",u.name,u.email,pm.role,(u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL) AS active,u.company_id,c.type AS "companyType",
 pm.id AS "membershipId",pm.created_at AS "membershipCreatedAt",u.session_version AS "sessionVersion",u.deactivated_at AS "deactivatedAt",pm.access_disabled_at AS "accessDisabledAt",
 (SELECT count(*)::int FROM project_responsibility_grants g WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=u.id AND g.revoked_at IS NULL) AS "responsibilityCount",
 (SELECT count(*)::int FROM acting_grants g WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=u.id AND g.revoked_at IS NULL) AS "actingCount"
 FROM project_memberships pm JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1 JOIN companies c ON c.id=u.company_id AND c.tenant_id=$1
 WHERE pm.project_id=$2 AND c.type<>'SUBCONTRACTOR'
), subject AS (SELECT * FROM people WHERE "userId"=$3 AND ((SELECT branch FROM current_access)<>'SURVEY_MANAGER' OR (active AND role IN ${editable}))),
 replacements AS (SELECT * FROM people WHERE role='SURVEY_SUPERINTENDENT' AND active AND "userId"<>$3),
 coverage_grants AS (SELECT g.* FROM project_responsibility_grants g WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id IN (SELECT "userId" FROM replacements) AND g.aor_node_id IN (SELECT aor_node_id FROM subject_grants)),
 coverage_assignments AS (SELECT aa.* FROM aor_assignments aa WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.department_id IS NULL AND aa.user_id IN (SELECT "userId" FROM replacements) AND aa.aor_node_id IN (SELECT aor_node_id FROM subject_grants)),
 snapshot AS (SELECT md5(jsonb_build_object(
 'project',(SELECT jsonb_build_object('status',status,'crewBuild',crew_build) FROM projects WHERE tenant_id=$1 AND id=$2),
 'subject',(SELECT to_jsonb(p) FROM people p WHERE "userId"=$3),
 'areas',(SELECT COALESCE(jsonb_agg(a ORDER BY id),'[]') FROM areas a),
 'grants',(SELECT COALESCE(jsonb_agg(g ORDER BY id),'[]') FROM subject_grants g),
 'people',(SELECT COALESCE(jsonb_agg(p ORDER BY "userId"),'[]') FROM replacements p),
 'coverage',(SELECT COALESCE(jsonb_agg(g ORDER BY id),'[]') FROM coverage_grants g),
 'assignments',(SELECT COALESCE(jsonb_agg(a ORDER BY id),'[]') FROM coverage_assignments a),
 'events',(SELECT COALESCE(jsonb_agg(e ORDER BY id),'[]') FROM access_grant_events e WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.resolution_evidence IS NOT NULL AND (e.subject_user_id=$3 OR e.grant_id IN (SELECT id FROM coverage_grants)))
 )::text) AS token)`;
export class ProtectedObligationsPgRepository implements ProtectedObligationsRepository{
 async readAuthority(db:DbClient,auth:AuthContext,projectId:UUID):Promise<ResolutionAuthority>{
  if(auth.expiresAt&&auth.expiresAt.getTime()<=Date.now())throw new UnauthorizedError('Session expired');
  await assertActiveSession(db,auth);
  const {rows}=await db.query<{status:ResolutionAuthority['project']['status'];crewBuild:ResolutionAuthority['project']['crewBuild'];companyId:UUID;companyType:string;centralId:UUID|null;projectMembershipId:UUID|null;projectAdminGrantId:UUID|null;accessDisabledAt:string|null;role:string|null}>(`SELECT p.status,p.crew_build AS "crewBuild",u.company_id AS "companyId",c.type AS "companyType",tm.id AS "centralId",pm.id AS "projectMembershipId",pag.id AS "projectAdminGrantId",pm.access_disabled_at::text AS "accessDisabledAt",pm.role
 FROM projects p JOIN users u ON u.tenant_id=p.tenant_id AND u.id=$3 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id
 LEFT JOIN tenant_memberships tm ON tm.tenant_id=p.tenant_id AND tm.user_id=u.id AND tm.role='TENANT_ADMIN' AND c.type IN ('GC','OWNER_REP')
 LEFT JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=u.id
 LEFT JOIN project_admin_grants pag ON pag.tenant_id=p.tenant_id AND pag.project_id=p.id AND pag.user_id=u.id AND pag.revoked_at IS NULL AND pm.access_disabled_at IS NULL AND pm.id IS NOT NULL AND c.type IN ('GC','OWNER_REP') WHERE p.tenant_id=$1 AND p.id=$2`,[auth.tenantId,projectId,auth.userId]);
  const row=rows[0];if(!row)throw new NotFoundError('Project not found');
  const branch=row.centralId?'CENTRAL_IT':row.projectAdminGrantId?'PROJECT_IT':row.role==='SURVEY_MANAGER'&&!row.accessDisabledAt&&row.companyType!=='SUBCONTRACTOR'?'SURVEY_MANAGER':null;
  if(!branch)throw new ForbiddenError('Reviewer handover requires current project Survey Manager or IT');
  return{branch,tenantId:auth.tenantId,projectId,actorId:auth.userId,actorMembershipId:branch==='CENTRAL_IT'?row.centralId!:row.projectMembershipId!,actorAdminGrantId:row.projectAdminGrantId??undefined,actorCompanyId:row.companyId,actorCompanyType:row.companyType,actorSessionVersion:auth.sessionVersion,expiresAt:auth.expiresAt,project:{status:row.status,crewBuild:row.crewBuild}};
 }
 async readPage(db:DbClient,scope:ProtectedScope,authority:ResolutionAuthority,input:ProtectedReadQuery):Promise<ProtectedReadResult>{
  const userId=input.mode==='personnel'?null:input.userId,q=input.query;
  const parameters=[scope.tenantId,scope.projectId,userId,authority.actorId,`%${q.search}%`,q.limit,q.offset,null,authority.actorSessionVersion,authority.expiresAt??null];
  if(input.mode==='personnel'){
   const {rows}=await db.query<{result:ProtectedReadResult}>(`WITH ${accessCte}, ${stateCte}, matching AS (SELECT "userId",name,email,role,active,"responsibilityCount","actingCount" FROM people WHERE ((SELECT branch FROM current_access)<>'SURVEY_MANAGER' OR (active AND role IN ${editable})) AND (name ILIKE $5 OR email ILIKE $5))
 SELECT jsonb_build_object('mode','personnel','project',jsonb_build_object('status',p.status,'crewBuild',p.crew_build),'personnel',jsonb_build_object('data',COALESCE((SELECT jsonb_agg(m ORDER BY lower(name),"userId") FROM (SELECT * FROM matching ORDER BY lower(name),"userId" LIMIT $6 OFFSET $7) m),'[]'),'total',(SELECT count(*) FROM matching),'limit',$6::int,'offset',$7::int)) AS result FROM projects p CROSS JOIN current_access WHERE p.tenant_id=$1 AND p.id=$2`,parameters);
   if(!rows[0])return this.denyRead(db,authority);return rows[0].result;
  }
  if(input.mode==='obligations'){
   const {rows}=await db.query<{result:ProtectedReadResult}>(`WITH ${accessCte}, ${stateCte}, obligations AS (
 SELECT g.id AS "grantId",g.responsibility,g.aor_node_id AS "areaId",a.name AS "areaName",
 (p.status<>'ARCHIVED' AND s.active AND g.responsibility='SURVEY_REVIEWER' AND a.depth=0 AND a.parent_id IS NULL AND a.retired_at IS NULL AND a.id IS NOT NULL) AS "canResolve",
 CASE WHEN p.status='ARCHIVED' THEN 'Archived project' WHEN NOT s.active THEN 'Inactive subject requires separate IT lifecycle' WHEN g.responsibility<>'SURVEY_REVIEWER' THEN 'Unsupported responsibility' WHEN a.id IS NULL OR a.depth<>0 OR a.parent_id IS NOT NULL OR a.retired_at IS NOT NULL THEN 'Requires a live top-level Area' ELSE NULL END AS "unsupportedReason",
 (SELECT CASE WHEN e.resolution_evidence->>'createdReviewGrant'='true' THEN e.resolution_evidence->>'coverageIntent' ELSE NULL END FROM access_grant_events e WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.grant_id=g.id AND e.action='RESPONSIBILITY_GRANTED' AND e.resolution_evidence IS NOT NULL ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) AS "addedCoverageIntent",
 (SELECT jsonb_build_object('id',aa.id,'coverageIntent',e.resolution_evidence->>'coverageIntent') FROM access_grant_events e
 JOIN aor_assignments aa ON aa.id::text=e.resolution_evidence->'replacementAssignment'->>'id' AND aa.tenant_id=$1 AND aa.project_id=$2 AND aa.user_id=g.user_id AND aa.aor_node_id=g.aor_node_id AND aa.department_id IS NULL AND aa.deactivated_at IS NULL
 WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.resolution_evidence->'replacementGrant'->>'id'=g.id::text AND e.resolution_evidence->>'createdIndividualAssignment'='true'
 ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) AS "addedIndividualAssignment"
 FROM subject_grants g LEFT JOIN areas a ON a.id=g.aor_node_id CROSS JOIN subject s JOIN projects p ON p.id=$2 AND p.tenant_id=$1 WHERE g.revoked_at IS NULL
 ), matching AS (SELECT * FROM obligations WHERE COALESCE("areaName",'') ILIKE $5 OR responsibility ILIKE $5)
 SELECT (SELECT jsonb_build_object('mode','obligations','project',jsonb_build_object('status',p.status,'crewBuild',p.crew_build),'person',jsonb_build_object('userId',s."userId",'name',s.name,'email',s.email,'role',s.role,'active',s.active,'responsibilityCount',s."responsibilityCount",'actingCount',s."actingCount"),'actingCount',s."actingCount",'departmentMembershipCount',(SELECT count(*) FROM department_memberships dm WHERE dm.tenant_id=$1 AND dm.project_id=$2 AND dm.user_id=$3 AND dm.deactivated_at IS NULL),'snapshotToken',snapshot.token,'obligations',jsonb_build_object('data',COALESCE((SELECT jsonb_agg(m ORDER BY "grantId") FROM (SELECT * FROM matching ORDER BY "grantId" LIMIT $6 OFFSET $7) m),'[]'),'total',(SELECT count(*) FROM matching),'limit',$6::int,'offset',$7::int)) FROM subject s CROSS JOIN snapshot JOIN projects p ON p.id=$2 AND p.tenant_id=$1) AS result FROM current_access`,parameters);
   if(!rows[0])return this.denyRead(db,authority);if(!rows[0].result)throw new NotFoundError('Project person not found');return rows[0].result;
  }
  const {rows}=await db.query<{result:ProtectedReadResult|null;subjectExists:boolean;grantExists:boolean;supported:boolean}>(`WITH ${accessCte}, ${stateCte}, selected AS (
 SELECT g.*,a.depth,a.parent_id,a.retired_at FROM subject_grants g JOIN areas a ON a.id=g.aor_node_id WHERE g.id=$8 AND g.revoked_at IS NULL AND g.responsibility='SURVEY_REVIEWER' AND a.depth=0 AND a.parent_id IS NULL AND a.retired_at IS NULL
 ), candidates AS (
 SELECT p."userId",p.name,p.email,
 (SELECT g.id FROM coverage_grants g WHERE g.user_id=p."userId" AND g.aor_node_id=s.aor_node_id AND g.responsibility='SURVEY_REVIEWER' AND g.revoked_at IS NULL ORDER BY g.granted_at,g.id LIMIT 1) AS "replacementGrantId",
 (SELECT a.id FROM coverage_assignments a WHERE a.user_id=p."userId" AND a.aor_node_id=s.aor_node_id AND a.deactivated_at IS NULL ORDER BY a.created_at,a.id LIMIT 1) AS "replacementAssignmentId"
 FROM replacements p CROSS JOIN selected s
 ), matching AS (SELECT *,"replacementGrantId" IS NOT NULL AND "replacementAssignmentId" IS NOT NULL AS "canReuse","replacementGrantId" IS NULL AS "missingReviewGrant","replacementAssignmentId" IS NULL AS "missingIndividualAssignment" FROM candidates WHERE name ILIKE $5 OR email ILIKE $5)
 SELECT EXISTS(SELECT 1 FROM subject) AS "subjectExists",EXISTS(SELECT 1 FROM subject_grants WHERE id=$8) AS "grantExists",EXISTS(SELECT 1 FROM selected) AS supported,
 jsonb_build_object('mode','candidates','snapshotToken',snapshot.token,'candidates',jsonb_build_object('data',COALESCE((SELECT jsonb_agg(m ORDER BY lower(name),"userId") FROM (SELECT * FROM matching ORDER BY lower(name),"userId" LIMIT $6 OFFSET $7) m),'[]'),'total',(SELECT count(*) FROM matching),'limit',$6::int,'offset',$7::int)) AS result FROM snapshot CROSS JOIN current_access`,[...parameters.slice(0,7),input.grantId,authority.actorSessionVersion,authority.expiresAt??null]);
  if(!rows[0])return this.denyRead(db,authority);
  if(!rows[0].subjectExists)throw new NotFoundError('Project person not found');
  if(!rows[0].grantExists)throw new NotFoundError('Scoped reviewer obligation not found');
  if(!rows[0].supported)throw new ConflictError('Choose a current reviewer obligation on a live top-level Area');
  return rows[0].result!;
 }
 private async denyRead(db:DbClient,authority:ResolutionAuthority):Promise<never>{
  if(authority.expiresAt&&authority.expiresAt.getTime()<=Date.now())throw new UnauthorizedError('Session expired');
  await assertActiveSession(db,{tenantId:authority.tenantId,userId:authority.actorId,sessionVersion:authority.actorSessionVersion});
  throw new ForbiddenError('Current reviewer resolution authority is required');
 }
 async snapshot(db:DbClient,scope:ProtectedScope,userId:UUID):Promise<string>{
  const {rows}=await db.query<{token:string}>(`WITH current_access AS (SELECT 'CENTRAL_IT'::text AS branch), ${stateCte} SELECT token FROM snapshot`,[scope.tenantId,scope.projectId,userId]);return rows[0]!.token;
 }
 async lockResolutionContext(db:DbClient,auth:AuthContext,projectId:UUID,input:ResolveReviewerInput):Promise<ResolutionContext>{
  const scope=[auth.tenantId,projectId];
  const project=await db.query('SELECT id FROM projects WHERE tenant_id=$1 AND id=$2 FOR NO KEY UPDATE',scope);
  if(!project.rows[0])throw new NotFoundError('Project not found');
  let authority=await this.readAuthority(db,auth,projectId);
  if(authority.project.status==='ARCHIVED')throw new ConflictError('Archived projects are read-only');
  const users=[...new Set([auth.userId,input.userId,input.replacementUserId])].sort();
  const accounts=await db.query<{id:UUID}>(`SELECT id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`,[auth.tenantId,users]);
  if(accounts.rows.length!==users.length)throw new NotFoundError('Scoped project person not found');
  // Do not filter current roles here: historical retries remain valid after
  // subject membership or replacement coverage/role loss. Actual authority
  // and fresh eligibility are checked separately after these waits.
  const heldProjectMemberships=await db.query<{id:UUID}>('SELECT id FROM project_memberships WHERE project_id=$1 AND user_id=ANY($2::uuid[]) ORDER BY user_id,id FOR SHARE',[projectId,users]);
  const heldTenantMemberships=await db.query<{id:UUID}>('SELECT id FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 ORDER BY user_id,id FOR SHARE',[auth.tenantId,auth.userId]);
  await db.query(`SELECT id FROM companies WHERE tenant_id=$1 AND id IN (SELECT company_id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[])) ORDER BY id FOR SHARE`,[auth.tenantId,users]);
  const heldAdminGrants=await db.query<{id:UUID}>('SELECT id FROM project_admin_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 ORDER BY id FOR SHARE',[auth.tenantId,projectId,auth.userId]);
  authority=await this.readAuthority(db,auth,projectId);
  if(authority.actorAdminGrantId&&!heldAdminGrants.rows.some(row=>row.id===authority.actorAdminGrantId))throw new ConflictError('Admin authority changed during validation');
  const heldAuthorityIds=new Set([...heldProjectMemberships.rows,...heldTenantMemberships.rows].map(row=>row.id));
  if(!heldAuthorityIds.has(authority.actorMembershipId))throw new ConflictError('Resolution authority changed during validation; retry with current evidence');
  const people=(await db.query<ResolutionPerson>(`SELECT u.id,u.company_id AS "companyId",c.type AS "companyType",u.session_version AS "sessionVersion",u.deactivated_at::text AS "deactivatedAt",pm.access_disabled_at::text AS "accessDisabledAt",pm.id AS "membershipId",pm.role FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id LEFT JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=u.id WHERE u.tenant_id=$1 AND u.id=ANY($3::uuid[])`,[...scope,users])).rows;
  const selected=(await db.query<ResponsibilityGrantEvidence>(`SELECT id,user_id AS "userId",aor_node_id AS "areaId",responsibility,granted_by AS "grantedBy",granted_at::text AS "grantedAt",revoked_at::text AS "revokedAt" FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND id=$4`,[...scope,input.userId,input.grantId])).rows[0];
  if(!selected)throw new NotFoundError('Scoped reviewer obligation not found');
  if(selected.areaId){
   await db.query('SELECT id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$3 FOR SHARE',[...scope,selected.areaId]);
   await db.query('SELECT id FROM aor_levels WHERE tenant_id=$1 AND project_id=$2 AND id IN (SELECT level_id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$3) ORDER BY id FOR SHARE',[...scope,selected.areaId]);
   await db.query('SELECT id FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4 AND department_id IS NULL ORDER BY id FOR SHARE',[...scope,input.replacementUserId,selected.areaId]);
  }
  await db.query(`SELECT id FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND (id=$3 OR (user_id=$4 AND aor_node_id=$5 AND responsibility='SURVEY_REVIEWER')) ORDER BY id FOR NO KEY UPDATE`,[...scope,input.grantId,input.replacementUserId,selected.areaId]);
  const grant=(await db.query<ResponsibilityGrantEvidence>(`SELECT id,user_id AS "userId",aor_node_id AS "areaId",responsibility,granted_by AS "grantedBy",granted_at::text AS "grantedAt",revoked_at::text AS "revokedAt" FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND id=$4`,[...scope,input.userId,input.grantId])).rows[0];
  if(!grant||grant.areaId!==selected.areaId)throw new ConflictError('Reviewer obligation scope changed; reload');
  const area=(await db.query<ResolutionArea>(`SELECT n.id,n.name,n.level_id AS "levelId",l.depth,n.parent_id AS "parentId",n.retired_at::text AS "retiredAt" FROM aor_nodes n JOIN aor_levels l ON l.id=n.level_id AND l.tenant_id=n.tenant_id AND l.project_id=n.project_id WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.id=$3`,[...scope,grant.areaId])).rows[0]??null;
  const replacementGrant=(await db.query<ResponsibilityGrantEvidence>(`SELECT id,user_id AS "userId",aor_node_id AS "areaId",responsibility,granted_by AS "grantedBy",granted_at::text AS "grantedAt",revoked_at::text AS "revokedAt" FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4 AND responsibility='SURVEY_REVIEWER' AND revoked_at IS NULL ORDER BY granted_at,id LIMIT 1`,[...scope,input.replacementUserId,grant.areaId])).rows[0]??null;
  const replacementAssignment=(await db.query<IndividualAssignmentEvidence>(`SELECT id,user_id AS "userId",aor_node_id AS "areaId",created_at::text AS "createdAt",deactivated_at::text AS "deactivatedAt" FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4 AND department_id IS NULL AND deactivated_at IS NULL ORDER BY created_at,id LIMIT 1`,[...scope,input.replacementUserId,grant.areaId])).rows[0]??null;
  return{authority,subject:people.find(p=>p.id===input.userId)!,replacement:people.find(p=>p.id===input.replacementUserId)!,grant,area,replacementGrant,replacementAssignment};
 }

 async createIndividualCoverage(db:DbClient,scope:ProtectedScope,userId:UUID,areaId:UUID,id:UUID,at:string):Promise<IndividualAssignmentEvidence>{
  const {rows}=await db.query<IndividualAssignmentEvidence>(`INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,user_id AS "userId",aor_node_id AS "areaId",created_at::text AS "createdAt",deactivated_at::text AS "deactivatedAt"`,[id,scope.tenantId,scope.projectId,userId,areaId,at]);return rows[0]!;
 }
 async createReviewCoverage(db:DbClient,scope:ProtectedScope,userId:UUID,areaId:UUID,actorId:UUID,id:UUID,at:string):Promise<ResponsibilityGrantEvidence>{
  try{
   const {rows}=await db.query<ResponsibilityGrantEvidence>(`INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by,granted_at) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6,$7) RETURNING id,user_id AS "userId",aor_node_id AS "areaId",responsibility,granted_by AS "grantedBy",granted_at::text AS "grantedAt",revoked_at::text AS "revokedAt"`,[id,scope.tenantId,scope.projectId,userId,areaId,actorId,at]);return rows[0]!;
  }catch(error){if((error as {code?:string}).code==='23505')throw new ConflictError('Replacement review coverage changed; reload');throw error;}
 }
 async revokeSelectedGrant(db:DbClient,scope:ProtectedScope,input:ResolveReviewerInput,actorId:UUID,at:string):Promise<boolean>{
  const {rows}=await db.query(`UPDATE project_responsibility_grants SET revoked_at=$5,revoked_by=$6 WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND id=$4 AND responsibility='SURVEY_REVIEWER' AND revoked_at IS NULL RETURNING id`,[scope.tenantId,scope.projectId,input.userId,input.grantId,at,actorId]);return rows.length===1;
 }
 async recordResolution(db:DbClient,context:ResolutionContext,input:ResolveReviewerInput,result:ResolveReviewerResult,coverage:{grant:ResponsibilityGrantEvidence;assignment:IndividualAssignmentEvidence},at:string):Promise<void>{
  const {authority}=context;
  const role=authority.branch==='CENTRAL_IT'?'TENANT_ADMIN':authority.branch==='PROJECT_IT'?'PROJECT_ADMIN':'SURVEY_MANAGER';
  const evidence={version:1,resolutionId:result.resolutionEventId,kind:'SURVEY_REVIEWER_RESOLUTION',confirmResolution:true,coverageRule:'EXACT_AREA',coverageMode:input.coverageMode,
   ...(input.coverageMode==='assignAdditional'?{confirmAdditionalCoverage:true,coverageIntent:input.coverageIntent}:{}),temporaryCoverage:input.coverageMode==='assignAdditional'&&input.coverageIntent==='TEMPORARY',
   originalGrant:context.grant,replacementGrant:coverage.grant,replacementAssignment:coverage.assignment,
   createdReviewGrant:result.createdReviewGrant,createdIndividualAssignment:result.createdIndividualAssignment,
   reviewGrantProvenance:result.createdReviewGrant?'CREATED':'REUSED',individualAssignmentProvenance:result.createdIndividualAssignment?'CREATED':'REUSED',
   previousReviewGrantAbsent:result.createdReviewGrant,previousIndividualAssignmentAbsent:result.createdIndividualAssignment,
   subject:context.subject,replacement:context.replacement,area:context.area,project:authority.project,verifiedSnapshot:input.expectedSnapshot,checkedAt:at,confirmedAt:at,
   authority:{branch:authority.branch==='SURVEY_MANAGER'?'PROJECT_SURVEY_MANAGER':role,membership:{id:authority.actorMembershipId,tenantId:authority.tenantId,projectId:authority.branch==='CENTRAL_IT'?null:authority.projectId,userId:authority.actorId,role},account:{userId:authority.actorId,active:true,sessionVersion:authority.actorSessionVersion},company:{id:authority.actorCompanyId,type:authority.actorCompanyType}}
  };
  await db.query(`INSERT INTO access_grant_events(id,tenant_id,project_id,company_id,subject_user_id,actor_id,action,grant_id,occurred_at,resolution_evidence) VALUES($1,$2,$3,$4,$5,$6,'RESPONSIBILITY_REVOKED',$7,$8,$9)`,[result.resolutionEventId,authority.tenantId,authority.projectId,context.subject.companyId,context.subject.id,authority.actorId,context.grant.id,at,evidence]);
  if(result.createdReviewGrant)await db.query(`INSERT INTO access_grant_events(id,tenant_id,project_id,company_id,subject_user_id,actor_id,action,grant_id,occurred_at,resolution_evidence) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'RESPONSIBILITY_GRANTED',$6,$7,$8)`,[authority.tenantId,authority.projectId,context.replacement.companyId,context.replacement.id,authority.actorId,coverage.grant.id,at,{...evidence,kind:'SURVEY_REVIEWER_HANDOVER_GRANT'}]);
 }

}
