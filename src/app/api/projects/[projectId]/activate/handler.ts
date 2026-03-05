import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import {
  activateProject,
  type ActivateProjectResult,
} from '@/modules/tenancy/application/activate-project';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';
import { resolveProjectSetupActorRole } from '../aor/shared';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface ProjectActivationRouteDeps {
  requireAuth: typeof requireAuth;
  resolveProjectSetupActorRole: typeof resolveProjectSetupActorRole;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: ProjectActivationRouteDeps = {
  requireAuth,
  resolveProjectSetupActorRole,
  createRepo: () => new TenancyRepository(),
  withTransaction,
};

function blockedResponse(result: Extract<ActivateProjectResult, { outcome: 'BLOCKED' }>) {
  const message =
    result.reason === 'HARD_FAILURES'
      ? 'Project activation readiness checks failed'
      : 'Project activation warnings must be acknowledged';

  return NextResponse.json(
    {
      error: {
        type: 'ConflictError',
        message,
      },
      reason: result.reason,
      readiness: result.readiness,
    },
    { status: 409 },
  );
}

export async function handlePostProjectActivation(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
  deps: ProjectActivationRouteDeps = defaultDeps,
) {
  try {
    const auth = deps.requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;

    if (
      body !== null &&
      typeof body === 'object' &&
      body.acknowledgeWarnings !== undefined &&
      typeof body.acknowledgeWarnings !== 'boolean'
    ) {
      throw new ValidationError('acknowledgeWarnings must be a boolean when provided');
    }

    const actorRole = await deps.resolveProjectSetupActorRole(
      pool,
      auth.tenantId,
      projectId as UUID,
      auth.userId,
    );
    const repo = deps.createRepo();

    const result = await deps.withTransaction((client) =>
      activateProject(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        actorId: auth.userId,
        actorRole,
        acknowledgeWarnings:
          body !== null && typeof body === 'object'
            ? body.acknowledgeWarnings as boolean | undefined
            : undefined,
      }),
    );

    if (result.outcome === 'BLOCKED') {
      return blockedResponse(result);
    }

    return NextResponse.json({
      project: result.project,
      readiness: result.readiness,
      warningsAcknowledged: result.warningsAcknowledged,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
