import { NextResponse,type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { ForbiddenError,ValidationError } from '@/shared/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
  const auth=await requireActiveAuth(req);
  if(await getTenantRole(pool,auth.tenantId,auth.userId,auth.sessionVersion)!=='TENANT_ADMIN')throw new ForbiddenError('Current Central IT authority is required');
  const query=req.nextUrl.searchParams;
  if([...query.keys()].some(key=>!['search','offset','limit'].includes(key)||query.getAll(key).length!==1))throw new ValidationError('Invalid account search');
  const search=query.get('search')??'',limit=Number(query.get('limit')??25),offset=Number(query.get('offset')??0);
  if(search.length>100||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new ValidationError('Invalid account page');
  const {rows}=await pool.query(`WITH matching AS (SELECT u.id AS "userId",u.name,u.email,c.name AS "companyName",u.deactivated_at AS "disabledAt"
    FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id WHERE u.tenant_id=$1 AND (u.name ILIKE $2 OR u.email ILIKE $2))
    SELECT jsonb_build_object('data',COALESCE((SELECT jsonb_agg(m ORDER BY lower(name),"userId") FROM (SELECT * FROM matching ORDER BY lower(name),"userId" LIMIT $3 OFFSET $4)m),'[]'),
      'total',(SELECT count(*) FROM matching),'limit',$3::int,'offset',$4::int) AS page`,[auth.tenantId,'%'+search+'%',limit,offset]);
  return NextResponse.json({accounts:rows[0].page});
}catch(error){return errorResponse(error);}}
