import type { DbClient, UUID } from '@/shared/types';
import { ValidationError } from '@/shared/errors';
import type { OffboardingScope } from '@/lib/contracts/account-offboarding';

export interface LifecycleEventInput {
  scope: OffboardingScope;
  tenantId: UUID;
  actorUserId: UUID;
  subjectUserId: UUID;
  projectId: UUID | null;
  reason: string;
  priorState: 'ACTIVE';
  newState: 'DISABLED';
  priorSessionVersion: number;
  newSessionVersion: number;
  authorityEvidence: Record<string, unknown>;
  snapshot: string;
  correlationKey: string;
}

/** Append only; caller holds lifecycle locks and owns the transaction. */
export async function appendLifecycleEvent(
  db: DbClient,
  event: LifecycleEventInput,
): Promise<UUID> {
  const projectId = event.scope.kind === 'PROJECT_ACCESS' ? event.scope.projectId : null;
  if (event.projectId !== projectId) {
    throw new ValidationError('Lifecycle event project does not match its scope');
  }
  const { rows } = await db.query<{ id: UUID }>(
    `INSERT INTO account_lifecycle_events(
      tenant_id,scope,project_id,subject_user_id,actor_id,event_type,reason,
      prior_state,new_state,prior_session_version,new_session_version,
      authority_evidence,snapshot,correlation_key
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
    RETURNING id`,
    [
      event.tenantId, event.scope.kind, projectId, event.subjectUserId, event.actorUserId,
      event.scope.kind === 'TENANT_ACCOUNT' ? 'user.deactivated' : 'user.project_access_disabled',
      event.reason, event.priorState, event.newState, event.priorSessionVersion,
      event.newSessionVersion, JSON.stringify(event.authorityEvidence),
      event.snapshot, event.correlationKey,
    ],
  );
  if (!rows[0]) throw new Error('Lifecycle event insert returned no identity');
  return rows[0].id;
}
