import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import {
  assignAorDepartment,
  deactivateAorDepartmentAssignment,
} from '@/modules/tenancy/application/assign-aor-department';
import {
  assignAorUser,
  deactivateAorUserAssignment,
} from '@/modules/tenancy/application/assign-aor-user';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';
import {
  assertProjectSetupMutable,
  resolveProjectSetupActorRole,
  type ProjectSetupActorRole,
} from '../shared';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface AorAssignmentsRouteDeps {
  requireAuth: typeof requireAuth;
  resolveProjectSetupActorRole: typeof resolveProjectSetupActorRole;
  assertProjectSetupMutable: typeof assertProjectSetupMutable;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: AorAssignmentsRouteDeps = {
  requireAuth,
  resolveProjectSetupActorRole,
  assertProjectSetupMutable,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

function isUuidArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function requireSetupKind(value: unknown): 'USER' | 'DEPARTMENT' {
  if (value === 'USER' || value === 'DEPARTMENT') {
    return value;
  }
  throw new ValidationError('kind must be USER or DEPARTMENT');
}

async function resolveActorRole(
  deps: AorAssignmentsRouteDeps,
  tenantId: UUID,
  projectId: UUID,
  userId: UUID,
  sessionVersion: number,
): Promise<ProjectSetupActorRole> {
  return deps.resolveProjectSetupActorRole(pool, tenantId, projectId, userId, sessionVersion);
}

export async function handlePostAorAssignments(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: AorAssignmentsRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;
    const kind = requireSetupKind(body?.kind);
    const actorRole = await resolveActorRole(
      deps,
      auth.tenantId,
      projectId as UUID,
      auth.userId,
      auth.sessionVersion,
    );
    await deps.assertProjectSetupMutable(pool, auth.tenantId, projectId as UUID);
    const repo = deps.createRepo();

    if (kind === 'USER') {
      if (
        typeof body.userId !== 'string' ||
        typeof body.aorNodeId !== 'string' ||
        (
          body.deactivateAssignmentIds !== undefined &&
          !isUuidArray(body.deactivateAssignmentIds)
        )
      ) {
        throw new ValidationError('USER assignments require userId, aorNodeId, and optional deactivateAssignmentIds[]');
      }

      const assignment = await deps.withTransaction((client) =>
        assignAorUser(repo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          userId: body.userId as UUID,
          aorNodeId: body.aorNodeId as UUID,
          actorRole,
          deactivateAssignmentIds: (body.deactivateAssignmentIds ?? []) as UUID[],
        }),
      );
      return NextResponse.json({ assignment }, { status: 201 });
    }

    if (
      typeof body.departmentId !== 'string' ||
      typeof body.aorNodeId !== 'string' ||
      (
        body.deactivateAssignmentIds !== undefined &&
        !isUuidArray(body.deactivateAssignmentIds)
      )
    ) {
      throw new ValidationError('DEPARTMENT assignments require departmentId, aorNodeId, and optional deactivateAssignmentIds[]');
    }

    const assignment = await deps.withTransaction((client) =>
      assignAorDepartment(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        departmentId: body.departmentId as UUID,
        aorNodeId: body.aorNodeId as UUID,
        actorRole,
        deactivateAssignmentIds: (body.deactivateAssignmentIds ?? []) as UUID[],
      }),
    );
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleDeleteAorAssignments(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: AorAssignmentsRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;
    const kind = requireSetupKind(body?.kind);
    if (typeof body.assignmentId !== 'string') {
      throw new ValidationError('assignmentId is required');
    }

    const actorRole = await resolveActorRole(
      deps,
      auth.tenantId,
      projectId as UUID,
      auth.userId,
      auth.sessionVersion,
    );
    await deps.assertProjectSetupMutable(pool, auth.tenantId, projectId as UUID);
    const repo = deps.createRepo();

    const assignment = await deps.withTransaction((client) => {
      if (kind === 'USER') {
        return deactivateAorUserAssignment(repo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          assignmentId: body.assignmentId as UUID,
          actorRole,
        });
      }
      return deactivateAorDepartmentAssignment(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        assignmentId: body.assignmentId as UUID,
        actorRole,
      });
    });
    return NextResponse.json({ assignment });
  } catch (err) {
    return errorResponse(err);
  }
}
