import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { listProjectTemplates } from '@/modules/tenancy/application/list-project-templates';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
 const auth=await requireActiveAuth(req);const actorRole=await getTenantRole(pool,auth.tenantId,auth.userId,auth.sessionVersion);
 const centralIT=actorRole==='TENANT_ADMIN';
 const {rows}=await pool.query(`SELECT p.id,p.name,p.status,p.crew_build AS "crewBuild" FROM projects p
 WHERE p.tenant_id=$1 AND ($3 OR EXISTS(SELECT 1 FROM project_admin_grants g
 JOIN project_memberships pm ON pm.project_id=g.project_id AND pm.user_id=g.user_id
 JOIN users u ON u.id=g.user_id AND u.tenant_id=g.tenant_id
 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
 WHERE g.tenant_id=p.tenant_id AND g.project_id=p.id AND g.user_id=$2 AND g.revoked_at IS NULL
 AND pm.access_disabled_at IS NULL AND u.deactivated_at IS NULL AND c.type IN ('GC','OWNER_REP')))
 ORDER BY p.created_at DESC,p.id LIMIT 100`,[auth.tenantId,auth.userId,centralIT]);
 const templates=centralIT?await listProjectTemplates(new TenancyRepository(),pool,{tenantId:auth.tenantId,actorRole}):[];
 return NextResponse.json({canCreateProject:centralIT,projects:rows,templates},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}
}
