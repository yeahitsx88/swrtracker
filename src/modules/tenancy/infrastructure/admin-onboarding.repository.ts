import type {DbClient, UUID} from '@/shared/types';

export interface AdminEmployee {
  userId: UUID; name: string; email: string; companyId: UUID; companyName: string;
  role: string | null; canAdminister: boolean;
}
export interface EmployeeInvitation {
  id: UUID; email: string; companyId: UUID; companyName: string;
  status: 'Pending' | 'Accepted' | 'Canceled' | 'Expired'; expiresAt: string;
  token: string | null;
}

/** All mutations participate in the route's EXCLUSIVE tenant transaction. */
export class AdminOnboardingRepository {
  async employees(db:DbClient,tenantId:UUID,projectId:UUID,centralIT:boolean,search:string,offset:number) {
    const result=await db.query<AdminEmployee & {total:number}>(`
      SELECT u.id AS "userId",u.name,u.email,c.id AS "companyId",c.name AS "companyName",
        pm.role,EXISTS(SELECT 1 FROM project_admin_grants g WHERE g.tenant_id=$1
          AND g.project_id=$2 AND g.user_id=u.id AND g.revoked_at IS NULL) AS "canAdminister",
        count(*) OVER()::int AS total
      FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
      LEFT JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=u.id
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
      SELECT i.id,i.email,i.company_id AS "companyId",c.name AS "companyName",i.expires_at::text AS "expiresAt",
        CASE WHEN i.accepted_at IS NOT NULL THEN 'Accepted' WHEN i.canceled_at IS NOT NULL THEN 'Canceled'
          WHEN i.expires_at<=NOW() THEN 'Expired' ELSE 'Pending' END AS status,
        CASE WHEN i.accepted_at IS NULL AND i.canceled_at IS NULL AND i.expires_at>NOW() THEN i.token::text ELSE NULL END AS token
      FROM invites i JOIN companies c ON c.id=i.company_id AND c.tenant_id=i.tenant_id
      WHERE i.tenant_id=$1 AND i.project_id=$2 AND i.role='REQUESTER' AND c.type IN ('GC','OWNER_REP')
      ORDER BY i.created_at DESC,i.id LIMIT 50`,[tenantId,projectId])).rows;
  }
  async eligibleEmployee(db:DbClient,tenantId:UUID,projectId:UUID,userId:UUID,centralIT:boolean) {
    return (await db.query<{companyId:UUID;role:string|null;disabledAt:Date|null}>(`
      SELECT c.id AS "companyId",pm.role,pm.access_disabled_at AS "disabledAt"
      FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
      LEFT JOIN project_memberships pm ON pm.project_id=$2 AND pm.user_id=u.id
      WHERE u.tenant_id=$1 AND u.id=$3 AND u.deactivated_at IS NULL AND c.type IN ('GC','OWNER_REP')
        AND ($4::boolean OR EXISTS(SELECT 1 FROM project_companies pc
          WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND pc.company_id=c.id)) FOR UPDATE OF u`,[tenantId,projectId,userId,centralIT])).rows[0];
  }
  async eligibleCompany(db:DbClient,tenantId:UUID,projectId:UUID,companyId:UUID,centralIT:boolean) {
    return !!(await db.query(`SELECT c.id FROM companies c WHERE c.tenant_id=$1 AND c.id=$3
      AND c.type IN ('GC','OWNER_REP') AND ($4::boolean OR EXISTS(SELECT 1 FROM project_companies pc
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
    return (await db.query<{id:UUID;companyId:UUID;token:string}>(`SELECT id,company_id AS "companyId",token::text
      FROM invites WHERE tenant_id=$1 AND project_id=$2 AND lower(email)=$3
      AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at>NOW() FOR UPDATE`,[tenantId,projectId,email])).rows[0];
  }
  async createInvitation(db:DbClient,tenantId:UUID,projectId:UUID,companyId:UUID,email:string,actorId:UUID) {
    return (await db.query<{id:UUID;token:string}>(`INSERT INTO invites(tenant_id,project_id,company_id,email,role,invited_by,expires_at)
      VALUES($1,$2,$3,$4,'REQUESTER',$5,NOW()+INTERVAL '7 days') RETURNING id,token::text`,[tenantId,projectId,companyId,email,actorId])).rows[0];
  }
  async cancelInvitation(db:DbClient,tenantId:UUID,projectId:UUID,inviteId:UUID) {
    return (await db.query<{id:UUID}>(`UPDATE invites i SET canceled_at=NOW() FROM companies c
      WHERE i.tenant_id=$1 AND i.project_id=$2 AND i.id=$3 AND c.id=i.company_id AND c.tenant_id=i.tenant_id
      AND c.type IN ('GC','OWNER_REP') AND i.role='REQUESTER' AND i.accepted_at IS NULL
      AND i.canceled_at IS NULL AND i.expires_at>NOW() RETURNING i.id`,[tenantId,projectId,inviteId])).rows[0];
  }
}
