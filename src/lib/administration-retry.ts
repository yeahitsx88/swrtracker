import type {NextRequest} from 'next/server';
import type {AuthContext} from './auth';
import type {DbClient} from '@/shared/types';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from './idempotency';
/** Legacy clients may omit a key; confirmed UI commands always supply one. Authorization belongs before this helper. */
export async function administrationRetry<T>(db:DbClient,req:NextRequest,auth:AuthContext,endpoint:string,body:unknown,status:number,perform:()=>Promise<T>):Promise<T>{
 if(!req.headers.has('Idempotency-Key'))return perform();
 const response=await executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint,idempotencyKey:requireIdempotencyKey(req)},body,async()=>({status,body:{value:await perform()}}));
 return (response.body as {value:T}).value;
}
