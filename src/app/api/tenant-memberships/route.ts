/**
 * POST /api/tenant-memberships
 * DELETE /api/tenant-memberships
 * Both require TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { withTransaction } from '@/lib/with-transaction';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { getTenantRole } from '@/lib/get-tenant-role';
import {
  removeTenantMembership,
  upsertTenantMembership,
} from '@/modules/tenancy/application/tenant-memberships';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { TenantMembership } from '@/modules/tenancy/domain/types';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const VALID_TENANT_ROLES: TenantMembership['role'][] = ['TENANT_ADMIN', 'BILLING_VIEWER'];

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json() as Record<string, unknown>;
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.userId !== 'string' ||
      typeof body.role !== 'string' ||
      !VALID_TENANT_ROLES.includes(body.role as TenantMembership['role'])
    ) {
      throw new ValidationError('userId and role (TENANT_ADMIN|BILLING_VIEWER) are required');
    }

    requireResourceUuid(body.userId,'userId');
    const repo = new TenancyRepository();
    const membership = await withTransaction(async db=>{
      const prior=(await db.query<{role:string}>('SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[auth.tenantId,body.userId])).rows[0]?.role??null;
      const result=await upsertTenantMembership(repo,db,{
        tenantId:auth.tenantId,userId:body.userId as UUID,role:body.role as TenantMembership['role'],actorRole:'TENANT_ADMIN',
      });
      await appendAdministrativeEvent(db,{auth,projectId:null,subjectUserId:body.userId as UUID,
        eventType:'tenant.membership_changed',authorityEvidence:{branch:'CENTRAL_IT'},
        changes:{priorRole:prior,role:body.role}});
      return result;
    },{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{
      if(await getTenantRole(db,current.tenantId,current.userId,current.sessionVersion)!=='TENANT_ADMIN'){
        throw new ForbiddenError('Current Central IT authority is required');
      }
    }});
    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object' || typeof body.userId !== 'string') {
      throw new ValidationError('userId is required');
    }

    requireResourceUuid(body.userId,'userId');
    const repo = new TenancyRepository();
    await withTransaction(async db=>{
      const prior=(await db.query<{role:string}>('SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[auth.tenantId,body.userId])).rows[0]?.role??null;
      await removeTenantMembership(repo,db,{
        tenantId:auth.tenantId,userId:body.userId as UUID,actorRole:'TENANT_ADMIN',
      });
      await appendAdministrativeEvent(db,{auth,projectId:null,subjectUserId:body.userId as UUID,
        eventType:'tenant.membership_removed',authorityEvidence:{branch:'CENTRAL_IT'},changes:{priorRole:prior}});
    },{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{
      if(await getTenantRole(db,current.tenantId,current.userId,current.sessionVersion)!=='TENANT_ADMIN'){
        throw new ForbiddenError('Current Central IT authority is required');
      }
    }});
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
