import {observeProjectRoute} from '@/lib/observe-project-route';
import {authorizeWritable} from '@/modules/tenancy/application/project-administration';
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
import { resolveProjectCapabilities } from '@/lib/project-capabilities';
import { resolveCustomRoleSelection } from '@/modules/tenancy/application/custom-roles';

export const dynamic = 'force-dynamic';

const VALID_ROLES: ProjectRole[] = [
  'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD', 'VIEWER',
];

async function observedGET(
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
      company_type:string; user_id: string; name: string; email: string; role: ProjectRole; custom_role_id:string|null; custom_role_name:string|null; session_version:number; access_disabled_at: string|null; account_disabled_at:string|null; total:string;
    }>(
      `SELECT c.type AS company_type,pm.user_id, u.name, u.email, pm.role,pm.custom_role_id,cr.name AS custom_role_name,u.session_version,pm.access_disabled_at::text,u.deactivated_at::text AS account_disabled_at,count(*) OVER()::text AS total
       FROM project_memberships pm JOIN users u ON u.id = pm.user_id JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
       LEFT JOIN tenant_custom_roles cr ON cr.id=pm.custom_role_id AND cr.tenant_id=u.tenant_id
       WHERE pm.project_id = $1 AND u.tenant_id = $2 AND ($3::boolean OR (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL))
       AND (u.name ILIKE $4 OR u.email ILIKE $4) ORDER BY pm.role, u.name, u.email LIMIT $5 OFFSET $6`,
      [projectUuid, auth.tenantId,includeDisabled,'%'+search+'%',limit,offset],
    );
    return NextResponse.json({
      total:Number(rows[0]?.total??0),limit,offset,
      members: rows.map((row) => ({ userId: row.user_id,companyType:row.company_type, name: row.name, email: row.email, role: row.role,customRoleId:row.custom_role_id,customRoleName:row.custom_role_name,sessionVersion:row.session_version,accessDisabledAt:row.access_disabled_at,accountDisabledAt:row.account_disabled_at })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function observedPOST(
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

    const { userId, role,customRoleId,customRoleVersion } = body as { userId: string; role: ProjectRole;customRoleId?:UUID;customRoleVersion?:number };
    if(customRoleId!==undefined){requireResourceUuid(customRoleId,'customRoleId');if(!Number.isInteger(customRoleVersion)||Number(customRoleVersion)<1)throw new ValidationError('Provide the current custom role version');}
    else if(customRoleVersion!==undefined)throw new ValidationError('A custom role ID is required with its version');
    requireResourceUuid(projectId,'projectId');
    requireResourceUuid(userId,'userId');
    const repo = new TenancyRepository();
    let branch:'TENANT_ADMIN'|'PROJECT_ADMIN'='PROJECT_ADMIN';
    await withTransaction(async db => administrationRetry(db,req,auth,`POST /api/projects/${projectId}/members`,{userId,role,...(customRoleId?{customRoleId,customRoleVersion}:{})},201,async()=>{
      const customRole=await resolveCustomRoleSelection(db,auth.tenantId,{role,customRoleId,customRoleVersion});
      if(branch==='PROJECT_ADMIN' && !(await db.query(`SELECT 1 FROM project_companies pc JOIN users u ON u.company_id=pc.company_id AND u.tenant_id=pc.tenant_id
        WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND u.id=$3`,[auth.tenantId,projectId,userId])).rows[0])throw new ForbiddenError('Associate the member company with this project first');
      await addProjectMember(repo, db, {
        tenantId: auth.tenantId, projectId: projectId as UUID, userId: userId as UUID,
        role, actorRole: branch,
      });
      if(customRole)await db.query('UPDATE project_memberships SET custom_role_id=$3 WHERE project_id=$1 AND user_id=$2',[projectId,userId,customRole.id]);
      await appendAdministrativeEvent(db,{
        auth,projectId:projectId as UUID,subjectUserId:userId as UUID,eventType:'project.member_added',
        authorityEvidence:{branch},changes:{role,customRole},
      });
    }), {req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{
      branch=(await authorizeWritable(db,current,projectId as UUID)).authority.centralIT?'TENANT_ADMIN':'PROJECT_ADMIN';
    }});
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
