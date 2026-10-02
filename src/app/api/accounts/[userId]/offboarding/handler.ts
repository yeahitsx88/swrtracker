import { NextResponse, type NextRequest } from 'next/server';
import type { DbClient, UUID } from '@/shared/types';
import type { AuthContext } from '@/lib/auth';
import { requireActiveAuth } from '@/lib/auth';
import { withTransaction, type AuthenticatedMutation } from '@/lib/with-transaction';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { requireIdempotencyKey, executeIdempotentHttpMutation } from '@/lib/idempotency';
import { errorResponse } from '@/lib/api-error';
import { ValidationError } from '@/shared/errors';
import type { OffboardingCommand, OffboardingScope } from '@/lib/contracts/account-offboarding';
import { authorizeOffboarding, previewOffboarding, disableAccountAccess, type OffboardingRepository } from '@/modules/identity/application/account-offboarding';
import { AccountOffboardingRepository } from '@/modules/identity/infrastructure/account-offboarding.repository';

export interface OffboardingRouteDeps {
  auth(req: NextRequest): Promise<AuthContext>;
  transaction<T>(fn: (db: DbClient) => Promise<T>, mutation: AuthenticatedMutation): Promise<T>;
  repository: OffboardingRepository;
}
const defaults: OffboardingRouteDeps = { auth: requireActiveAuth, transaction: withTransaction, repository: new AccountOffboardingRepository() };

export function parseOffboardingCommand(body: unknown, scope: OffboardingScope, subject: UUID, key: string): OffboardingCommand {
  if (!body || typeof body!=='object' || Array.isArray(body)) throw new ValidationError('Offboarding confirmation is required');
  const value=body as Record<string, unknown>;
  if (Object.keys(value).some(field=>!['subjectUserId','scope','reason','snapshot','confirmed'].includes(field)) ||
    value.subjectUserId!==subject || typeof value.reason!=='string' || typeof value.snapshot!=='string' || value.confirmed!==true) {
    throw new ValidationError('Use the current subject, scope, preview, reason and explicit confirmation');
  }
  const supplied=value.scope;
  if (!supplied || typeof supplied!=='object' || Array.isArray(supplied)) throw new ValidationError('Explicit offboarding scope is required');
  const wire=supplied as Record<string,unknown>;
  if (wire.kind!==scope.kind || (scope.kind==='PROJECT_ACCESS' && wire.projectId!==scope.projectId) ||
    Object.keys(wire).some(field=>field!=='kind' && !(scope.kind==='PROJECT_ACCESS' && field==='projectId'))) throw new ValidationError('Scope does not match the selected endpoint');
  const reason=value.reason.trim();
  if (reason.length<10 || reason.length>1000 || !/^[a-f0-9]{64}$/.test(value.snapshot)) throw new ValidationError('A current preview and reason of 10–1000 characters are required');
  return {subjectUserId:subject,scope,reason,snapshot:value.snapshot,confirmed:true,idempotencyKey:key};
}

export async function handleOffboarding(req: NextRequest, scope: OffboardingScope, subjectUserId: string, deps: OffboardingRouteDeps=defaults) {
  try {
    const auth=await deps.auth(req);
    requireResourceUuid(subjectUserId,'userId');
    if (scope.kind==='PROJECT_ACCESS') requireResourceUuid(scope.projectId,'projectId');
    const subject=subjectUserId as UUID;
    const authorize=(db:DbClient,current:AuthContext)=>authorizeOffboarding(db,current,scope,subject);
    if (req.method==='GET') {
      const query=new URL(req.url).searchParams;
      if([...query.keys()].some(key=>!['offset','snapshot'].includes(key)) || [...query.keys()].some(key=>query.getAll(key).length!==1)) throw new ValidationError('Invalid preview page');
      const rawOffset=query.get('offset')??'0', expectedSnapshot=query.get('snapshot')??undefined;
      if(!/^(0|[1-9][0-9]{0,6})$/.test(rawOffset)||Number(rawOffset)%25!==0 || (expectedSnapshot!==undefined&&!/^[a-f0-9]{64}$/.test(expectedSnapshot)) || (Number(rawOffset)>0&&!expectedSnapshot)) throw new ValidationError('Use a snapshot-bound blocker page');
      const preview=await deps.transaction(db=>previewOffboarding(deps.repository,db,auth,scope,subject,Number(rawOffset),expectedSnapshot),{req,auth,mode:'SHARED',authorize});
      return NextResponse.json({preview});
    }
    const key=requireIdempotencyKey(req);
    const command=parseOffboardingCommand(await req.json(),scope,subject,key);
    const endpoint=scope.kind==='TENANT_ACCOUNT'?`POST /api/accounts/${subject}/offboarding`:`POST /api/projects/${scope.projectId}/members/${subject}/offboarding`;
    const result=await deps.transaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint,idempotencyKey:key},
      {...command,idempotencyKey:undefined},async()=>({status:200,body:{result:await disableAccountAccess(deps.repository,db,auth,command)}})),
      {req,auth,mode:'EXCLUSIVE',authorize});
    return NextResponse.json({...result.body,replayed:result.replayed},{status:result.status});
  } catch(error) { return errorResponse(error); }
}
