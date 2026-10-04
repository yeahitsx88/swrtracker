import {observeProjectRoute} from '@/lib/observe-project-route';
import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { assertProjectAdministrator } from '@/lib/project-capabilities';
import { assertRecommissioningMutation } from '@/lib/recommissioning-gate';
import { withTransaction } from '@/lib/with-transaction';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { errorResponse } from '@/lib/api-error';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { createProjectEmployee, EMPLOYEE_ROLES, type EmployeeInput } from '@/modules/tenancy/application/create-project-employee';
import type { UUID } from '@/shared/types';
export const dynamic='force-dynamic';
async function observedPOST(req:NextRequest,{params}:{params:Promise<{projectId:string}>}) {
  try {
    const auth=await requireActiveAuth(req),{projectId}=await params;
    requireResourceUuid(projectId,'projectId');
    const body=await req.json() as Record<string,unknown>;
    if (!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['companyId','name','email','password','role','customRoleId','customRoleVersion','projectAdmin','confirmed'].includes(k))||
      typeof body.companyId!=='string'||typeof body.name!=='string'||!body.name.trim()||body.name.length>200||
      typeof body.email!=='string'||body.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())||
      typeof body.password!=='string'||body.password.length<8||Buffer.byteLength(body.password,'utf8')>72||
      !EMPLOYEE_ROLES.includes(body.role as typeof EMPLOYEE_ROLES[number])||typeof body.projectAdmin!=='boolean'||body.confirmed!==true)
      throw new ValidationError('Provide a name, company email, associated company, role, password of 8–72 bytes, and explicit confirmation');
    requireResourceUuid(body.companyId,'companyId');
    if(body.customRoleId!==undefined){if(typeof body.customRoleId!=='string')throw new ValidationError('Invalid custom role ID');requireResourceUuid(body.customRoleId,'customRoleId');if(!Number.isInteger(body.customRoleVersion)||Number(body.customRoleVersion)<1)throw new ValidationError('Provide the current custom role version');}
    else if(body.customRoleVersion!==undefined)throw new ValidationError('A custom role ID is required with its version');
    const key=requireIdempotencyKey(req);
    const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,
      endpoint:`POST /api/projects/${projectId}/employees`,idempotencyKey:key},body,async()=>({status:201,
      body:{employee:await createProjectEmployee(db,auth,projectId as UUID,body as unknown as EmployeeInput)}})),
      {req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{const authority=await assertProjectAdministrator(db,current,projectId as UUID);if(body.projectAdmin&&!authority.centralIT)throw new ForbiddenError('Only Tenant Admin can create Project Admin accounts.');await assertRecommissioningMutation(db,current.tenantId,projectId as UUID);}});
    return NextResponse.json(result.body,{status:result.status});
  } catch(error) {return errorResponse(error);}
}

export const POST=observeProjectRoute(observedPOST);
