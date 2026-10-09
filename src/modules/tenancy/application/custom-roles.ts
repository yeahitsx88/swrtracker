import type { AuthContext } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import { assertProjectAdministrator } from '@/lib/project-capabilities';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { validateCustomRole, type CustomRole, type CustomRoleBase } from '../domain/custom-role';

export async function authorizeCustomRoleManagement(db: DbClient, auth: AuthContext) {
  if (await getTenantRole(db,auth.tenantId,auth.userId,auth.sessionVersion) !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only Tenant Admin can manage tenant-wide custom roles.');
  }
}
export async function readCustomRoles(db: DbClient, auth: AuthContext, projectId?: UUID): Promise<CustomRole[]> {
  let countProjectId:UUID|null=null;
  if (projectId) {
    const capability=await assertProjectAdministrator(db,auth,projectId);
    if(!capability.centralIT)countProjectId=projectId;
  }
  else await authorizeCustomRoleManagement(db,auth);
  return (await db.query<CustomRole>(`SELECT r.id,r.name,r.base_role AS "baseRole",r.version,
    (SELECT count(*)::int FROM project_memberships pm WHERE pm.custom_role_id=r.id
      AND ($2::uuid IS NULL OR pm.project_id=$2)) AS "assignmentCount"
    FROM tenant_custom_roles r WHERE r.tenant_id=$1 ORDER BY lower(r.name),r.id`,[auth.tenantId,countProjectId])).rows;
}
/** Caller holds the exclusive tenant lifecycle barrier, before any idempotent replay. */
export async function saveCustomRole(db: DbClient, auth: AuthContext, input: {name: unknown;baseRole: unknown}, id?: UUID, expectedVersion?: number) {
  await authorizeCustomRoleManagement(db,auth);
  const valid = validateCustomRole(input);
  const previous = id ? (await db.query<{name:string;base_role:CustomRoleBase;version:number}>(
    'SELECT name,base_role,version FROM tenant_custom_roles WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[auth.tenantId,id])).rows[0] : undefined;
  if (id && !previous) throw new NotFoundError('Custom role not found.');
  if (previous && previous.version !== expectedVersion) throw new ConflictError('This role changed. Reload before reviewing it again.');
  if (previous && previous.base_role !== valid.baseRole && valid.baseRole === 'VIEWER' && (await db.query(
    `SELECT 1 FROM project_memberships pm JOIN users u ON u.id=pm.user_id JOIN companies c ON c.id=u.company_id
      WHERE pm.custom_role_id=$1 AND c.type='SUBCONTRACTOR' LIMIT 1`,[id])).rows[0]) {
    throw new ConflictError('Reassign subcontractor accounts before changing this role to Viewer. Their project access is Requester only.');
  }
  if ((await db.query(`SELECT 1 FROM tenant_custom_roles WHERE tenant_id=$1 AND
    normalized_name=lower(regexp_replace(btrim($2), '[[:space:]_-]+', ' ', 'g')) AND ($3::uuid IS NULL OR id<>$3)`,[auth.tenantId,valid.name,id??null])).rows[0]) {
    throw new ConflictError('A role with this name already exists in this tenant.');
  }
  const role = (await db.query<{id:UUID;name:string;baseRole:CustomRoleBase;version:number}>(id ?
    `UPDATE tenant_custom_roles SET name=$3,base_role=$4,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2
      RETURNING id,name,base_role AS "baseRole",version` :
    `INSERT INTO tenant_custom_roles(tenant_id,name,base_role,created_by) VALUES($1,$3,$4,$2)
      RETURNING id,name,base_role AS "baseRole",version`,[auth.tenantId,id??auth.userId,valid.name,valid.baseRole])).rows[0]!;
  let affected = 0;
  if (previous && previous.base_role !== valid.baseRole) {
    const memberships = await db.query<{user_id:UUID}>(`UPDATE project_memberships SET role=$2 WHERE custom_role_id=$1 RETURNING user_id`,[role.id,role.baseRole]);
    const users = [...new Set(memberships.rows.map(r=>r.user_id))];
    if (users.length) await db.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=ANY($2::uuid[])',[auth.tenantId,users]);
    affected = memberships.rows.length;
  }
  await appendAdministrativeEvent(db,{auth,projectId:null,subjectUserId:null,
    eventType:previous?'tenant.custom_role_updated':'tenant.custom_role_created',authorityEvidence:{actorRole:'TENANT_ADMIN'},
    changes:{role,previous:previous??null,updatedAssignments:affected,exactTemplateInheritance:true}});
  return role;
}
export async function deleteCustomRole(db: DbClient, auth: AuthContext, id: UUID, expectedVersion: number) {
  await authorizeCustomRoleManagement(db,auth);
  const role = (await db.query('SELECT id,name,version,base_role FROM tenant_custom_roles WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[auth.tenantId,id])).rows[0];
  if (!role) throw new NotFoundError('Custom role not found.');
  if (role.version !== expectedVersion) throw new ConflictError('This role changed. Reload before reviewing deletion.');
  if ((await db.query('SELECT 1 FROM project_memberships WHERE custom_role_id=$1 LIMIT 1',[id])).rows[0]) throw new ConflictError('Reassign every project assignment before deleting this role. No assignment will be orphaned.');
  await db.query('DELETE FROM tenant_custom_roles WHERE tenant_id=$1 AND id=$2',[auth.tenantId,id]);
  await appendAdministrativeEvent(db,{auth,projectId:null,subjectUserId:null,eventType:'tenant.custom_role_deleted',authorityEvidence:{actorRole:'TENANT_ADMIN'},changes:{role,assignments:0}});
  return {deleted:true};
}
export async function resolveCustomRoleSelection(db: DbClient, tenantId: UUID, input: {customRoleId?: UUID;customRoleVersion?: number;role:string}) {
  if (!input.customRoleId) return null;
  const role = (await db.query<{id:UUID;name:string;baseRole:CustomRoleBase;version:number}>(
    'SELECT id,name,base_role AS "baseRole",version FROM tenant_custom_roles WHERE tenant_id=$1 AND id=$2 FOR SHARE',[tenantId,input.customRoleId])).rows[0];
  if (!role) throw new NotFoundError('Custom role not found in this tenant.');
  if (role.version !== input.customRoleVersion || role.baseRole !== input.role) throw new ConflictError('The custom role changed. Reload the role list and review its current permissions.');
  return role;
}
