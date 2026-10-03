import type {DbClient,UUID} from '@/shared/types';
import type {CustomRole,CreateCustomRole} from '../domain/custom-role';
export async function listCustomRoles(db:DbClient,tenantId:UUID):Promise<CustomRole[]> {
 return (await db.query<CustomRole>(`SELECT id,name,description,base_role AS "baseRole",created_at::text AS "createdAt"
  FROM tenant_custom_roles WHERE tenant_id=$1 ORDER BY lower(name),id`,[tenantId])).rows;
}
export async function findCustomRole(db:DbClient,tenantId:UUID,id:UUID):Promise<CustomRole|undefined> {
 return (await db.query<CustomRole>(`SELECT id,name,description,base_role AS "baseRole",created_at::text AS "createdAt"
  FROM tenant_custom_roles WHERE tenant_id=$1 AND id=$2`,[tenantId,id])).rows[0];
}
export async function insertCustomRole(db:DbClient,tenantId:UUID,actorId:UUID,input:CreateCustomRole):Promise<CustomRole|undefined> {
 return (await db.query<CustomRole>(`INSERT INTO tenant_custom_roles(tenant_id,name,description,base_role,created_by)
  VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING
  RETURNING id,name,description,base_role AS "baseRole",created_at::text AS "createdAt"`,[tenantId,input.name,input.description,input.baseRole,actorId])).rows[0];
}
