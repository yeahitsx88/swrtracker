import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { listDepartmentTitles } from '@/modules/tenancy/application/list-department-titles';
import { upsertDepartmentTitle } from '@/modules/tenancy/application/upsert-department-title';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';
import { assertProjectSetupMutable, resolveProjectSetupActorRole } from '../../../aor/route';

export const dynamic = 'force-dynamic';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface DepartmentTitlesRouteDeps {
  requireAuth: typeof requireAuth;
  resolveProjectSetupActorRole: typeof resolveProjectSetupActorRole;
  assertProjectSetupMutable: typeof assertProjectSetupMutable;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: DepartmentTitlesRouteDeps = {
  requireAuth,
  resolveProjectSetupActorRole,
  assertProjectSetupMutable,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

export async function handlePostDepartmentTitles(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; departmentId: string }> },
  deps: DepartmentTitlesRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId, departmentId } = await params;
    const body = await req.json() as Record<string, unknown>;

    if (
      typeof body.title !== 'string' ||
      typeof body.defaultPriority !== 'string' ||
      typeof body.assignmentLayer !== 'string'
    ) {
      throw new ValidationError('title, defaultPriority, and assignmentLayer are required');
    }
    const {
      title,
      defaultPriority,
      assignmentLayer,
    } = body as { title: string; defaultPriority: string; assignmentLayer: string };

    const actorRole = await deps.resolveProjectSetupActorRole(
      pool,
      auth.tenantId,
      projectId as UUID,
      auth.userId,
    );
    await deps.assertProjectSetupMutable(pool, auth.tenantId, projectId as UUID);
    const repo = deps.createRepo();

    const departmentTitle = await deps.withTransaction((client) =>
      upsertDepartmentTitle(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        departmentId: departmentId as UUID,
        title,
        defaultPriority: defaultPriority as never,
        assignmentLayer: assignmentLayer as never,
        actorRole,
      }),
    );

    return NextResponse.json({ title: departmentTitle }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleGetDepartmentTitles(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; departmentId: string }> },
  deps: DepartmentTitlesRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId, departmentId } = await params;

    const actorRole = await deps.resolveProjectSetupActorRole(
      pool,
      auth.tenantId,
      projectId as UUID,
      auth.userId,
    );
    const repo = deps.createRepo();

    const titles = await deps.withTransaction((client) =>
      listDepartmentTitles(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        departmentId: departmentId as UUID,
        actorRole,
      }),
    );

    return NextResponse.json({ titles });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handlePostDepartmentTitles(req, ctx);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; departmentId: string }> },
) {
  return handleGetDepartmentTitles(req, ctx);
}
