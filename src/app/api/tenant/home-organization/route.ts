import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {errorResponse} from '@/lib/api-error';
import {ForbiddenError} from '@/shared/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const auth=await requireActiveAuth(req);
 const company=(await pool.query('SELECT c.id,c.name,c.type FROM tenants t JOIN companies c ON c.tenant_id=t.id AND c.id=t.home_company_id WHERE t.id=$1',[auth.tenantId])).rows[0]??null;
 return NextResponse.json({company,canManage:false},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
/** Reject even a previously recorded Tenant IT command; support owns the account binding. */
export async function PATCH(req:NextRequest){try{
 await requireActiveAuth(req);
 throw new ForbiddenError('The home organization is bound to your tenant account. Contact Axiom customer support for changes.');
}catch(error){return errorResponse(error);}}
