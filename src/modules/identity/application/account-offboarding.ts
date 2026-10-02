import { createHash } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { AuthContext } from '@/lib/auth';
import { assertActiveSession } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import { assertProjectAdministrator } from '@/lib/project-capabilities';
import { acquireTenantLifecycleLock } from '@/lib/tenant-lifecycle-lock';
import type { OffboardingBlocker, OffboardingCommand, OffboardingPreview, OffboardingResult, OffboardingScope } from '@/lib/contracts/account-offboarding';

export interface OffboardingState {
  subject: { id: UUID; sessionVersion: number; disabledAt: string | null; companyId: UUID; companyType: string };
  membership: { disabledAt: string | null } | null;
  blockers: OffboardingBlocker[];
  blockerTotal: number;
  centralITRecipients: UUID[];
  evidence: unknown;
}
export interface OffboardingRepository {
  readState(db: DbClient, auth: AuthContext, scope: OffboardingScope, subject: UUID, offset?: number): Promise<OffboardingState | null>;
  disable(db: DbClient, auth: AuthContext, command: OffboardingCommand, state: OffboardingState): Promise<OffboardingResult>;
}

/** Authorization always precedes subject lookup and saved-result access. Caller owns the transaction. */
export async function authorizeOffboarding(db: DbClient, auth: AuthContext, scope: OffboardingScope, subject: UUID): Promise<void> {
  await assertActiveSession(db, auth);
  if (scope.kind === 'TENANT_ACCOUNT') {
    if (await getTenantRole(db, auth.tenantId, auth.userId, auth.sessionVersion) !== 'TENANT_ADMIN') {
      throw new ForbiddenError('Current Central IT authority is required');
    }
  } else await assertProjectAdministrator(db, auth, scope.projectId);
  if (subject === auth.userId) throw new ForbiddenError('You cannot disable your own access');
}

export function offboardingSnapshot(state: OffboardingState, scope: OffboardingScope): string {
  return createHash('sha256').update(JSON.stringify({ scope, evidence: state.evidence })).digest('hex');
}

export async function previewOffboarding(repo: OffboardingRepository, db: DbClient, auth: AuthContext, scope: OffboardingScope, subject: UUID, offset = 0, expectedSnapshot?: string): Promise<OffboardingPreview> {
  await acquireTenantLifecycleLock(db, auth.tenantId, 'SHARED');
  await authorizeOffboarding(db, auth, scope, subject);
  const state = await repo.readState(db, auth, scope, subject, offset);
  if (!state) throw new NotFoundError('Account or project member not found');
  const snapshot = offboardingSnapshot(state, scope);
  if (expectedSnapshot && expectedSnapshot !== snapshot) throw new ConflictError('Offboarding evidence changed; reload before paging', 'STALE_OFFBOARDING');
  return { scope, subjectUserId: subject, snapshot, blockerTotal:state.blockerTotal, blockerOffset:offset, blockerLimit:25,
    alreadyDisabled: !!state.subject.disabledAt || (scope.kind === 'PROJECT_ACCESS' && !!state.membership?.disabledAt),
    blockers: state.blockers, centralITRecipientCount: scope.kind === 'PROJECT_ACCESS' ? state.centralITRecipients.length : 0,
    retainsCentralIT: scope.kind === 'PROJECT_ACCESS' && state.centralITRecipients.includes(subject) };
}

export async function disableAccountAccess(repo: OffboardingRepository, db: DbClient, auth: AuthContext, command: OffboardingCommand): Promise<OffboardingResult> {
  await acquireTenantLifecycleLock(db, auth.tenantId, 'EXCLUSIVE');
  await authorizeOffboarding(db, auth, command.scope, command.subjectUserId);
  if (command.confirmed !== true || command.reason !== command.reason.trim() || command.reason.length < 10 || command.reason.length > 1000 ||
      !/^[a-f0-9]{64}$/.test(command.snapshot)) throw new ValidationError('A current preview, reason and explicit confirmation are required');
  const state = await repo.readState(db, auth, command.scope, command.subjectUserId);
  if (!state) throw new NotFoundError('Account or project member not found');
  // Fresh keys against already-disabled state are truthful no-ops, including concurrent different-key commands.
  if (!state.subject.disabledAt && !(command.scope.kind === 'PROJECT_ACCESS' && state.membership?.disabledAt)) {
    if (command.snapshot !== offboardingSnapshot(state, command.scope)) throw new ConflictError('Offboarding evidence changed; reload and confirm again', 'STALE_OFFBOARDING');
    if (state.blockerTotal) throw new ConflictError('Resolve the displayed duties and continuity blockers before disabling access', 'OFFBOARDING_BLOCKED');
  }
  return repo.disable(db, auth, command, state);
}
