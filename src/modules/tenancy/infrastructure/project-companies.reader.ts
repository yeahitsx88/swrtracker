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

/** Decision 57 / D7: read-only company details for project administration. No outcome metrics. */
export interface ProjectCompanyDetails {
  company:{id:string;name:string;type:string;associatedAt:string};
  roster:Array<{userId:string;name:string;email:string;role:string;accessDisabled:boolean;accountDisabled:boolean}>;
  requestsByMonth:Array<{month:string;requests:number}>;
}
/** Null when the company is not associated with this project (never another tenant's). */
export async function readProjectCompanyDetails(db:DbClient,tenantId:UUID,projectId:UUID,companyId:UUID):Promise<ProjectCompanyDetails|null>{
  const company=(await db.query<ProjectCompanyDetails['company']>(`SELECT c.id,c.name,c.type,pc.associated_at::text AS "associatedAt"
    FROM project_companies pc JOIN companies c ON c.tenant_id=pc.tenant_id AND c.id=pc.company_id
    WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND pc.company_id=$3`,[tenantId,projectId,companyId])).rows[0];
  if(!company)return null;
  const roster=(await db.query<ProjectCompanyDetails['roster'][number]>(`SELECT u.id AS "userId",u.name,u.email,pm.role,
    pm.access_disabled_at IS NOT NULL AS "accessDisabled",u.deactivated_at IS NOT NULL AS "accountDisabled"
    FROM project_memberships pm JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1
    WHERE pm.project_id=$2 AND u.company_id=$3 ORDER BY lower(u.name),u.id LIMIT 500`,[tenantId,projectId,companyId])).rows;
  const requestsByMonth=(await db.query<ProjectCompanyDetails['requestsByMonth'][number]>(`SELECT to_char(date_trunc('month',t.submitted_at),'YYYY-MM') AS month,count(*)::int AS requests
    FROM tickets t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.company_id=$3 AND t.submitted_at IS NOT NULL AND t.draft_deleted_at IS NULL
      AND t.submitted_at>=date_trunc('month',NOW())-interval '11 months'
    GROUP BY 1 ORDER BY 1`,[tenantId,projectId,companyId])).rows;
  return {company,roster,requestsByMonth};
}
