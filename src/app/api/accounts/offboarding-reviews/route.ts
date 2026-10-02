import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {authorizeOffboardingReview} from '@/modules/identity/application/account-offboarding-review';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
  const auth=await requireActiveAuth(req);await authorizeOffboardingReview(pool,auth);
  const query=req.nextUrl.searchParams;
  if([...query.keys()].some(key=>!['status','offset','limit'].includes(key)||query.getAll(key).length!==1))throw new ValidationError('Invalid review page');
  const status=query.get('status')??'PENDING',offset=Number(query.get('offset')??0),limit=Number(query.get('limit')??25);
  if(!['PENDING','RESOLVED'].includes(status)||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new ValidationError('Invalid review page');
  const {rows}=await pool.query(`WITH matching AS (SELECT r.id,r.project_id AS "projectId",r.subject_user_id AS "subjectUserId",r.reason,r.created_at AS "createdAt",r.status,
    p.name AS "projectName",u.name AS "subjectName",u.email AS "subjectEmail" FROM account_offboarding_reviews r
    JOIN projects p ON p.tenant_id=r.tenant_id AND p.id=r.project_id JOIN users u ON u.tenant_id=r.tenant_id AND u.id=r.subject_user_id
    WHERE r.tenant_id=$1 AND r.status=$2) SELECT jsonb_build_object('data',COALESCE((SELECT jsonb_agg(m ORDER BY "createdAt",id) FROM
    (SELECT * FROM matching ORDER BY "createdAt",id LIMIT $3 OFFSET $4)m),'[]'),'total',(SELECT count(*) FROM matching),'limit',$3::int,'offset',$4::int) AS page`,[auth.tenantId,status,limit,offset]);
  return NextResponse.json({reviews:rows[0].page});
}catch(error){return errorResponse(error);}}
