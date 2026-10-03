import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {errorResponse} from '@/lib/api-error';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {authorizeAppearance,changeAppearance,parseAppearanceCommand,readAppearance} from '@/modules/identity/application/appearance';
import {SqlAppearanceStore} from '@/modules/identity/infrastructure/appearance.store';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest){try{const auth=await requireActiveAuth(req);return NextResponse.json(await readAppearance(new SqlAppearanceStore(),pool,auth),{headers});}catch(error){return errorResponse(error);}}
export async function PUT(req:NextRequest){try{
 const auth=await requireActiveAuth(req),command=parseAppearanceCommand(await req.json()),key=requireIdempotencyKey(req);
 const response=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:'/api/account/appearance',idempotencyKey:key},command,async()=>({status:200,body:await changeAppearance(new SqlAppearanceStore(),db,auth,command)})),{req,auth,mode:'EXCLUSIVE',authorize:db=>authorizeAppearance(db,auth,command)});
 return NextResponse.json(response.body,{status:response.status,headers});
 }catch(error){return errorResponse(error);}}
