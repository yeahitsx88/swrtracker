import type {DbClient, UUID} from '@/shared/types';

export interface AdminEmployee {
  userId: UUID; name: string; email: string; companyId: UUID; companyName: string;
  role: string | null; customRoleName?:string|null; canAdminister: boolean;
}
export interface EmployeeInvitation {
  id: UUID; email: string; companyId: UUID; companyName: string;
  status: 'Pending' | 'Accepted' | 'Canceled' | 'Expired'; expiresAt: string;
  token: string | null;
  purpose: 'PROJECT_ADMIN' | 'EMPLOYEE';
  role:string;customRoleId:UUID|null;customRoleName:string|null;
  employee: AdminEmployee | null;
}

/** All mutations participate in the route's EXCLUSIVE tenant transaction. */
export class AdminOnboardingRepository {
  async employees(db:DbClient,tenantId:UUID,projectId:UUID,centralIT:boolean,search:string,offset:number) {
    const result=await db.query<AdminEmployee & {total:number}>(`
      SELECT u.id AS "userId",u.name,u.email,c.id AS "companyId",c.name AS "companyName",
        pm.role,cr.name AS "customRoleName",EXISTS(SELECT 1 FROM project_admin_grants g WHERE g.tenant_id=$1
          AND g.project_id=$2 AND g.user_id=u.id AND g.revoked_at IS NULL) AS "canAdminister",
        count(*) OVER()::int AS total
      FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
      LEFT JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=u.id
      LEFT JOIN tenant_custom_roles cr ON cr.id=pm.custom_role_id AND cr.tenant_id=$1
      WHERE u.tenant_id=$1 AND u.deactivated_at IS NULL AND c.type IN ('GC','OWNER_REP')
        AND (pm.id IS NULL OR pm.access_disabled_at IS NULL)
        AND ($3::boolean OR EXISTS(SELECT 1 FROM project_companies pc
          WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND pc.company_id=c.id))
        AND (u.name ILIKE $4 OR u.email ILIKE $4)
      ORDER BY lower(u.name),u.id LIMIT 25 OFFSET $5`,[tenantId,projectId,centralIT,'%'+search+'%',offset]);
    return {employees:result.rows.map(({total: _total,...employee})=>employee),total:result.rows[0]?.total??0};
  }
  async companies(db:DbClient,tenantId:UUID,projectId:UUID,centralIT:boolean,search:string) {
    return (await db.query<{id:UUID;name:string;type:string}>(`
      SELECT c.id,c.name,c.type FROM companies c WHERE c.tenant_id=$1 AND c.type IN ('GC','OWNER_REP')
        AND ($3::boolean OR EXISTS(SELECT 1 FROM project_companies pc
          WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND pc.company_id=c.id))
        AND c.name ILIKE $4 ORDER BY lower(c.name),c.id LIMIT 100`,[tenantId,projectId,centralIT,'%'+search+'%'])).rows;
  }
  async invitations(db:DbClient,tenantId:UUID,projectId:UUID):Promise<EmployeeInvitation[]> {
    return (await db.query<EmployeeInvitation>(`
      SELECT i.id,i.email,i.role,i.custom_role_id AS "customRoleId",cr.name AS "customRoleName",i.company_id AS "companyId",c.name AS "companyName",i.expires_at::text AS "expiresAt",
        CASE WHEN i.accepted_at IS NOT NULL THEN 'Accepted' WHEN i.canceled_at IS NOT NULL THEN 'Canceled'
          WHEN i.expires_at<=NOW() THEN 'Expired' ELSE 'Pending' END AS status,
        CASE WHEN i.accepted_at IS NULL AND i.canceled_at IS NULL AND i.expires_at>NOW() THEN i.token::text ELSE NULL END AS token,
        COALESCE(e.changes->>'purpose','PROJECT_ADMIN') AS purpose,
        CASE WHEN u.id IS NOT NULL AND u.deactivated_at IS NULL AND pm.id IS NOT NULL AND pm.access_disabled_at IS NULL
          THEN jsonb_build_object('userId',u.id,'name',u.name,'email',u.email,'companyId',c.id,
            'companyName',c.name,'role',pm.role,'customRoleName',member_role.name,'canAdminister',EXISTS(SELECT 1 FROM project_admin_grants g
              WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=u.id AND g.revoked_at IS NULL))
          ELSE NULL END AS employee
      FROM invites i JOIN companies c ON c.id=i.company_id AND c.tenant_id=i.tenant_id
      LEFT JOIN tenant_custom_roles cr ON cr.tenant_id=i.tenant_id AND cr.id=i.custom_role_id
      JOIN administrative_events e ON e.tenant_id=i.tenant_id AND e.project_id=i.project_id
        AND e.event_type='user.invited' AND e.changes->>'inviteId'=i.id::text
        AND e.changes->>'source'='ADMIN_ONBOARDING'
      LEFT JOIN users u ON i.accepted_at IS NOT NULL AND u.tenant_id=i.tenant_id
        AND lower(u.email)=lower(i.email) AND u.company_id=i.company_id
      LEFT JOIN project_memberships pm ON pm.project_id=i.project_id AND pm.user_id=u.id
      LEFT JOIN tenant_custom_roles member_role ON member_role.tenant_id=i.tenant_id AND member_role.id=pm.custom_role_id
      WHERE i.tenant_id=$1 AND i.project_id=$2 AND c.type IN ('GC','OWNER_REP')
      ORDER BY i.created_at DESC,i.id LIMIT 50`,[tenantId,projectId])).rows;
  }
  async tenantCompanies(db:DbClient,tenantId:UUID) {
    return (await db.query<{id:UUID;name:string;type:string}>(`
      SELECT c.id,c.name,c.type FROM tenants t JOIN companies c ON c.tenant_id=t.id AND c.id=t.home_company_id
      WHERE t.id=$1 AND c.type IN ('GC','OWNER_REP')`,[tenantId])).rows;
  }
  async administrators(db:DbClient,tenantId:UUID,projectId:UUID) {
    return (await db.query<{userId:UUID;name:string;companyName:string}>(`
      SELECT u.id AS "userId",u.name,c.name AS "companyName" FROM project_admin_grants g
      JOIN users u ON u.tenant_id=g.tenant_id AND u.id=g.user_id AND u.deactivated_at IS NULL
      JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id AND c.type IN ('GC','OWNER_REP')
      JOIN project_memberships pm ON pm.project_id=g.project_id AND pm.user_id=u.id AND pm.access_disabled_at IS NULL
      WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.revoked_at IS NULL
      ORDER BY u.name,u.id LIMIT 25`,[tenantId,projectId])).rows;
  }
  async eligibleEmployee(db:DbClient,tenantId:UUID,projectId:UUID,userId:UUID,centralIT:boolean) {
    return (await db.query<{companyId:UUID;role:string|null;disabledAt:Date|null}>(`
      SELECT c.id AS "companyId",pm.role,pm.access_disabled_at AS "disabledAt"
      FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
      LEFT JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=u.id
      LEFT JOIN tenant_custom_roles cr ON cr.id=pm.custom_role_id AND cr.tenant_id=$1
      WHERE u.tenant_id=$1 AND u.id=$3 AND u.deactivated_at IS NULL AND c.type IN ('GC','OWNER_REP')
        AND ($4::boolean OR EXISTS(SELECT 1 FROM project_companies pc
          WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND pc.company_id=c.id)) FOR UPDATE OF u`,[tenantId,projectId,userId,centralIT])).rows[0];
  }
  async eligibleCompany(db:DbClient,tenantId:UUID,projectId:UUID,companyId:UUID,centralIT:boolean) {
    return !!(await db.query(`SELECT c.id FROM companies c WHERE c.tenant_id=$1 AND c.id=$3
      AND c.type IN ('GC','OWNER_REP') AND ($4::boolean OR EXISTS(SELECT 1 FROM tenants t WHERE t.id=$1 AND t.home_company_id=c.id) OR EXISTS(SELECT 1 FROM project_companies pc
        WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND pc.company_id=c.id))`,[tenantId,projectId,companyId,centralIT])).rows[0];
  }
  async addRequesterMembership(db:DbClient,projectId:UUID,userId:UUID) {
    return !!(await db.query(`INSERT INTO project_memberships(project_id,user_id,role)
      VALUES($1,$2,'REQUESTER') ON CONFLICT(project_id,user_id) DO NOTHING RETURNING id`,[projectId,userId])).rows[0];
  }
  async existingAccount(db:DbClient,tenantId:UUID,email:string) {
    return !!(await db.query('SELECT id FROM users WHERE tenant_id=$1 AND lower(email)=$2',[tenantId,email])).rows[0];
  }
  async pendingInvitation(db:DbClient,tenantId:UUID,projectId:UUID,email:string) {
    return (await db.query<{id:UUID;companyId:UUID;token:string;purpose:string|null;role:string;customRoleId:UUID|null}>(`
      SELECT i.id,i.role,i.custom_role_id AS "customRoleId",i.company_id AS "companyId",i.token::text,
        (SELECT COALESCE(e.changes->>'purpose','PROJECT_ADMIN') FROM administrative_events e
          WHERE e.tenant_id=i.tenant_id AND e.project_id=i.project_id AND e.event_type='user.invited'
            AND e.changes->>'inviteId'=i.id::text AND e.changes->>'source'='ADMIN_ONBOARDING' LIMIT 1) AS purpose
      FROM invites i WHERE i.tenant_id=$1 AND i.project_id=$2 AND lower(i.email)=$3
      AND i.accepted_at IS NULL AND i.canceled_at IS NULL AND i.expires_at>NOW() FOR UPDATE OF i`,[tenantId,projectId,email])).rows[0];
  }
  async createInvitation(db:DbClient,tenantId:UUID,projectId:UUID,companyId:UUID,email:string,actorId:UUID,role:string='REQUESTER',customRoleId?:UUID) {
    return (await db.query<{id:UUID;token:string}>(`INSERT INTO invites(tenant_id,project_id,company_id,email,role,invited_by,expires_at,custom_role_id)
      VALUES($1,$2,$3,$4,$6,$5,NOW()+INTERVAL '7 days',$7) RETURNING id,token::text`,[tenantId,projectId,companyId,email,actorId,role,customRoleId??null])).rows[0];
  }
  async cancelInvitation(db:DbClient,tenantId:UUID,projectId:UUID,inviteId:UUID) {
    return (await db.query<{id:UUID}>(`UPDATE invites i SET canceled_at=NOW() FROM companies c
      WHERE i.tenant_id=$1 AND i.project_id=$2 AND i.id=$3 AND c.id=i.company_id AND c.tenant_id=i.tenant_id
      AND c.type IN ('GC','OWNER_REP') AND EXISTS(SELECT 1 FROM administrative_events e WHERE e.tenant_id=i.tenant_id AND e.project_id=i.project_id
        AND e.event_type='user.invited' AND e.changes->>'inviteId'=i.id::text AND e.changes->>'source'='ADMIN_ONBOARDING') AND i.accepted_at IS NULL
      AND i.canceled_at IS NULL AND i.expires_at>NOW() RETURNING i.id`,[tenantId,projectId,inviteId])).rows[0];
  }
}
