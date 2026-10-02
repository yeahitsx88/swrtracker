import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth, requireActiveAuth } from '@/lib/auth';
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
  requireAuth: typeof requireAuth | typeof requireActiveAuth;
  resolveProjectSetupActorRole: typeof resolveProjectSetupActorRole;
  createRepo: () => ITenancyRepository;
  withTransaction: TransactionRunner;
}

const defaultDeps: ProjectActivationRouteDeps = {
  requireAuth: requireActiveAuth,
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
    const auth = await deps.requireAuth(req);
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

    const repo = deps.createRepo();

    const result = await deps.withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', deps.requireAuth);
      const actorRole = await deps.resolveProjectSetupActorRole(
        client,
        auth.tenantId,
        projectId as UUID,
        auth.userId,
        auth.sessionVersion,
      );
      const changed = await activateProject(repo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        actorId: auth.userId,
        actorRole,
        acknowledgeWarnings:
        body !== null && typeof body === 'object'
        ? body.acknowledgeWarnings as boolean | undefined
        : undefined,
      });
      if (changed.outcome === 'ACTIVATED') await appendAdministrativeEvent(client, {
        auth, projectId: projectId as UUID, subjectUserId: null,
        eventType: 'project.activated', authorityEvidence: { actorRole },
        changes: { resource: 'ACTIVATION', result: changed },
      });
      return changed;
    });

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
