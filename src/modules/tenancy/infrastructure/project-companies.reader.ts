import type {DbClient,UUID} from '@/shared/types';
export interface ProjectCompanyRecord {
  id:string;name:string;type:string;associatedAt:string;associatedBy:string;
  members:number;invitations:number;grants:number;
}
export interface MatchingTenantCompany {id:string;name:string;type:string;associated:boolean}
/** Exact normalized-name discovery for authorized project administration, never another tenant. */
export async function findTenantCompaniesByName(db:DbClient,tenantId:UUID,projectId:UUID,name:string):Promise<MatchingTenantCompany[]>{
  return (await db.query<MatchingTenantCompany>(`SELECT c.id,c.name,c.type,
    EXISTS(SELECT 1 FROM project_companies pc WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND pc.company_id=c.id) AS associated
    FROM companies c WHERE c.tenant_id=$1
    AND lower(btrim(regexp_replace(c.name,'[[:space:]]+',' ','g'))) = lower(btrim(regexp_replace($3::text,'[[:space:]]+',' ','g')))
    ORDER BY c.created_at,c.id LIMIT 100`,[tenantId,projectId,name])).rows;
}
/** Current removal dependencies. Disabled tenant accounts still retain enabled project access. */
export async function readProjectCompanies(db:DbClient,tenantId:UUID,projectId:UUID):Promise<ProjectCompanyRecord[]>{
  return (await db.query<ProjectCompanyRecord>(`SELECT c.id,c.name,c.type,pc.associated_at::text AS "associatedAt",pc.associated_by AS "associatedBy",
    (SELECT count(*)::int FROM project_memberships pm JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1
      WHERE pm.project_id=$2 AND u.company_id=c.id AND pm.access_disabled_at IS NULL) AS members,
    (SELECT count(*)::int FROM invites i WHERE i.tenant_id=$1 AND i.project_id=$2 AND i.company_id=c.id
      AND i.accepted_at IS NULL AND i.canceled_at IS NULL AND i.expires_at>NOW()) AS invitations,
    ((SELECT count(*) FROM company_authority_grants g WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.company_id=c.id AND g.revoked_at IS NULL)
      +(SELECT count(*) FROM project_admin_grants g JOIN users u ON u.tenant_id=g.tenant_id AND u.id=g.user_id
        WHERE g.tenant_id=$1 AND g.project_id=$2 AND u.company_id=c.id AND g.revoked_at IS NULL)
      +(SELECT count(*) FROM project_responsibility_grants g JOIN users u ON u.tenant_id=g.tenant_id AND u.id=g.user_id
        WHERE g.tenant_id=$1 AND g.project_id=$2 AND u.company_id=c.id AND g.revoked_at IS NULL))::int AS grants
    FROM project_companies pc JOIN companies c ON c.tenant_id=pc.tenant_id AND c.id=pc.company_id
    WHERE pc.tenant_id=$1 AND pc.project_id=$2 ORDER BY lower(c.name),c.id`,[tenantId,projectId])).rows;
}
