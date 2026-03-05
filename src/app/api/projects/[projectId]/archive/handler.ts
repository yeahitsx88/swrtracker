import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { withTransaction } from '@/lib/with-transaction';
import { archiveProject } from '@/modules/tenancy/application/archive-project';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface ProjectArchiveRouteDeps {
  requireAuth: typeof requireAuth;
  getTenantRole: typeof getTenantRole;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: ProjectArchiveRouteDeps = {
  requireAuth,
  getTenantRole,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

export async function handlePostProjectArchive(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: ProjectArchiveRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId } = await params;
    const actorRole = await deps.getTenantRole(pool, auth.tenantId, auth.userId);
    const repo = deps.createRepo();

    const project = await deps.withTransaction((client) =>
      archiveProject(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        actorId: auth.userId,
        actorRole,
      }),
    );

    return NextResponse.json({ project });
  } catch (err) {
    return errorResponse(err);
  }
}
