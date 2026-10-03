import { administrationRetry } from '@/lib/administration-retry';
import { withTransaction } from '@/lib/with-transaction';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
/**
 * POST /api/projects/[projectId]/members
 * Adds a user to a project. Requires TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';

import { addProjectMember } from '@/modules/tenancy/application/add-project-member';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { UUID } from '@/shared/types';
import { assertProjectAdministrator, resolveProjectCapabilities } from '@/lib/project-capabilities';

export const dynamic = 'force-dynamic';

const VALID_ROLES: ProjectRole[] = [
  'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD', 'VIEWER',
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    requireResourceUuid(projectId,'projectId');
    const projectUuid = projectId as UUID;
    const tenantRole = await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    const capabilities=await resolveProjectCapabilities(pool,auth,projectUuid);
    if (tenantRole !== 'TENANT_ADMIN') {
      if (!capabilities.canAdminister && capabilities.operationalRole !== 'SURVEY_MANAGER') {
        throw new ForbiddenError('Only IT administrators or the Survey Lead may list project members');
      }
    }
    const includeDisabled=req.nextUrl.searchParams.get('includeDisabled')==='true';
    if(includeDisabled && !capabilities.canAdminister)throw new ForbiddenError('Historical access administration requires project authority');
    const query=req.nextUrl.searchParams,limit=Number(query.get('limit')??100),offset=Number(query.get('offset')??0),search=query.get('search')??'';
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||search.length>100)throw new ValidationError('Invalid member page');
    const { rows } = await pool.query<{
      user_id: string; name: string; email: string; role: ProjectRole; access_disabled_at: string|null; account_disabled_at:string|null; total:string;can_administer:boolean;custom_role_id:string|null;custom_role_name:string|null;
    }>(
      `SELECT pm.user_id, u.name, u.email, pm.role,pm.custom_role_id,cr.name AS custom_role_name,pm.access_disabled_at::text,u.deactivated_at::text AS account_disabled_at,count(*) OVER()::text AS total,
       EXISTS(SELECT 1 FROM project_admin_grants g WHERE g.tenant_id=$2 AND g.project_id=$1 AND g.user_id=u.id AND g.revoked_at IS NULL) AS can_administer
       FROM project_memberships pm JOIN users u ON u.id = pm.user_id
       LEFT JOIN tenant_custom_roles cr ON cr.id=pm.custom_role_id AND cr.tenant_id=$2
       WHERE pm.project_id = $1 AND u.tenant_id = $2 AND ($3::boolean OR (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL))
       AND (u.name ILIKE $4 OR u.email ILIKE $4) ORDER BY pm.role, u.name, u.email LIMIT $5 OFFSET $6`,
      [projectUuid, auth.tenantId,includeDisabled,'%'+search+'%',limit,offset],
    );
    return NextResponse.json({
      total:Number(rows[0]?.total??0),limit,offset,
      members: rows.map((row) => ({ userId: row.user_id, name: row.name, email: row.email, role: row.role,customRoleId:row.custom_role_id,customRoleName:row.custom_role_name,canAdminister:row.can_administer,accessDisabledAt:row.access_disabled_at,accountDisabledAt:row.account_disabled_at })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).userId !== 'string' ||
        typeof (body as Record<string, unknown>).role   !== 'string' ||
        !VALID_ROLES.includes((body as Record<string, unknown>).role as ProjectRole)) {
      throw new ValidationError(`userId and role (${VALID_ROLES.join('|')}) are required`);
    }

    const { userId, role, customRoleId } = body as { userId: string; role: ProjectRole; customRoleId?: string };
    if(customRoleId!==undefined){if(typeof customRoleId!=='string')throw new ValidationError('Choose a valid custom role');requireResourceUuid(customRoleId,'customRoleId');}
    requireResourceUuid(projectId,'projectId');
    requireResourceUuid(userId,'userId');
    const repo = new TenancyRepository();
    let branch:'TENANT_ADMIN'|'PROJECT_ADMIN'='PROJECT_ADMIN';
    await withTransaction(async db => administrationRetry(db,req,auth,`POST /api/projects/${projectId}/members`,{userId,role,...(customRoleId?{customRoleId}:{})},201,async()=>{
      if(branch==='PROJECT_ADMIN' && !(await db.query(`SELECT 1 FROM project_companies pc JOIN users u ON u.company_id=pc.company_id AND u.tenant_id=pc.tenant_id
        WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND u.id=$3`,[auth.tenantId,projectId,userId])).rows[0])throw new ForbiddenError('Associate the member company with this project first');
      await addProjectMember(repo, db, {
        tenantId: auth.tenantId, projectId: projectId as UUID, userId: userId as UUID,
        role, customRoleId:customRoleId as UUID|undefined, actorRole: branch,
      });
      await appendAdministrativeEvent(db,{
        auth,projectId:projectId as UUID,subjectUserId:userId as UUID,eventType:'project.member_added',
        authorityEvidence:{branch},changes:{role,customRoleId:customRoleId??null},
      });
    }), {req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{
      branch=(await assertProjectAdministrator(db,current,projectId as UUID)).centralIT?'TENANT_ADMIN':'PROJECT_ADMIN';
    }});
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
