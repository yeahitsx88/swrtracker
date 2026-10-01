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
 if(actorRole!=='TENANT_ADMIN')return NextResponse.json({canCreateProject:false,projects:[],templates:[]},{headers:{'Cache-Control':'private, no-store'}});
 const {rows}=await pool.query('SELECT id,name,status,crew_build AS "crewBuild" FROM projects WHERE tenant_id=$1 ORDER BY created_at DESC,id LIMIT 100',[auth.tenantId]);
 const templates=await listProjectTemplates(new TenancyRepository(),pool,{tenantId:auth.tenantId,actorRole});
 return NextResponse.json({canCreateProject:true,projects:rows,templates},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}
}
