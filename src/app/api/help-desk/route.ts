import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {readSupport} from '@/modules/support/application/help-desk';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const auth=await requireActiveAuth(req),offset=Number(req.nextUrl.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0)throw new ValidationError('Invalid help desk page.');return NextResponse.json(await readSupport(pool,auth,undefined,offset),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
