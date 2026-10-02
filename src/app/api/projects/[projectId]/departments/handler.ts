import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth, requireActiveAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { createDepartment } from '@/modules/tenancy/application/create-department';
import { listDepartments } from '@/modules/tenancy/application/list-departments';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';
import {
  assertProjectSetupMutable,
  resolveProjectSetupActorRole,
} from '../aor/shared';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface DepartmentsRouteDeps {
  requireAuth: typeof requireAuth | typeof requireActiveAuth;
  resolveProjectSetupActorRole: typeof resolveProjectSetupActorRole;
  assertProjectSetupMutable: typeof assertProjectSetupMutable;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: DepartmentsRouteDeps = {
  requireAuth: requireActiveAuth,
  resolveProjectSetupActorRole,
  assertProjectSetupMutable,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

export async function handlePostDepartments(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: DepartmentsRouteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;

    if (typeof body.name !== 'string' || typeof body.managerTitle !== 'string') {
      throw new ValidationError('name and managerTitle are required');
    }
    const { name, managerTitle } = body as { name: string; managerTitle: string };

    const repo = deps.createRepo();

    const department = await deps.withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', deps.requireAuth);
      const actorRole = await deps.resolveProjectSetupActorRole(
        client,
        auth.tenantId,
        projectId as UUID,
        auth.userId,
        auth.sessionVersion,
      );
      await deps.assertProjectSetupMutable(client, auth.tenantId, projectId as UUID);
      const changed = await createDepartment(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        name,
        managerTitle,
        actorId: auth.userId,
        actorRole,
      });
      await appendAdministrativeEvent(client, {
        auth, projectId: projectId as UUID, subjectUserId: null,
        eventType: 'project.configuration_changed', authorityEvidence: { actorRole },
        changes: { resource: 'DEPARTMENT', result: changed },
      });
      return changed;
    });

    return NextResponse.json({ department }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleGetDepartments(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: DepartmentsRouteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requireAuth(req);
    const { projectId } = await params;
    const actorRole = await deps.resolveProjectSetupActorRole(
      pool,
      auth.tenantId,
      projectId as UUID,
      auth.userId,
      auth.sessionVersion,
    );
    const repo = deps.createRepo();

    const departments = await deps.withTransaction((client) =>
      listDepartments(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        actorRole,
      }),
    );

    return NextResponse.json({ departments });
  } catch (err) {
    return errorResponse(err);
  }
}
