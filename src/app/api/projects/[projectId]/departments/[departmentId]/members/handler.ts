import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectRole } from '@/lib/get-project-role';
import { getTenantRole } from '@/lib/get-tenant-role';
import { withTransaction } from '@/lib/with-transaction';
import { addDepartmentMember } from '@/modules/tenancy/application/add-department-member';
import { assignDepartmentTitle } from '@/modules/tenancy/application/assign-department-title';
import { reassignDepartmentMember } from '@/modules/tenancy/application/reassign-department-member';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { assertProjectSetupMutable } from '../../../aor/shared';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;
type DepartmentMembershipActorRole = 'TENANT_ADMIN' | ProjectRole;

export interface DepartmentMembersRouteDeps {
  requireAuth: typeof requireAuth;
  resolveActorRole: typeof resolveDepartmentMembershipActorRole;
  assertProjectSetupMutable: typeof assertProjectSetupMutable;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: DepartmentMembersRouteDeps = {
  requireAuth,
  resolveActorRole: resolveDepartmentMembershipActorRole,
  assertProjectSetupMutable,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

export async function resolveDepartmentMembershipActorRole(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  userId: UUID,
): Promise<DepartmentMembershipActorRole> {
  const tenantRole = await getTenantRole(db, tenantId, userId);
  if (tenantRole === 'TENANT_ADMIN') {
    return 'TENANT_ADMIN';
  }
  return getProjectRole(db, tenantId, projectId, userId);
}

export async function handlePostDepartmentMembers(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; departmentId: string }> },
  deps: DepartmentMembersRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId, departmentId } = await params;
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.userId !== 'string') {
      throw new ValidationError('userId is required');
    }

    const actorRole = await deps.resolveActorRole(pool, auth.tenantId, projectId as UUID, auth.userId);
    await deps.assertProjectSetupMutable(pool, auth.tenantId, projectId as UUID);
    const repo = deps.createRepo();

    const membership = await deps.withTransaction((client) =>
      addDepartmentMember(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        departmentId: departmentId as UUID,
        userId: body.userId as UUID,
        actorRole: actorRole as 'PROJECT_ADMIN' | 'TENANT_ADMIN',
      }),
    );

    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handlePatchDepartmentMembers(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; departmentId: string }> },
  deps: DepartmentMembersRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId, departmentId } = await params;
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.kind !== 'string' || typeof body.userId !== 'string') {
      throw new ValidationError('kind and userId are required');
    }

    const actorRole = await deps.resolveActorRole(pool, auth.tenantId, projectId as UUID, auth.userId);
    await deps.assertProjectSetupMutable(pool, auth.tenantId, projectId as UUID);
    const repo = deps.createRepo();

    if (body.kind === 'ASSIGN_TITLE') {
      if (typeof body.title !== 'string') {
        throw new ValidationError('title is required for ASSIGN_TITLE');
      }
      const { title } = body as { title: string };

      const membership = await deps.withTransaction((client) =>
        assignDepartmentTitle(repo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          departmentId: departmentId as UUID,
          userId: body.userId as UUID,
          title,
          actorId: auth.userId,
          actorRole,
          superintendentId: typeof body.superintendentId === 'string'
            ? body.superintendentId as UUID
            : null,
        }),
      );
      return NextResponse.json({ membership });
    }

    if (body.kind === 'REASSIGN_MEMBER') {
      const membership = await deps.withTransaction((client) =>
        reassignDepartmentMember(repo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          departmentId: departmentId as UUID,
          userId: body.userId as UUID,
          actorRole: actorRole as 'PROJECT_ADMIN' | 'TENANT_ADMIN',
        }),
      );
      return NextResponse.json({ membership });
    }

    throw new ValidationError('kind must be ASSIGN_TITLE or REASSIGN_MEMBER');
  } catch (err) {
    return errorResponse(err);
  }
}
