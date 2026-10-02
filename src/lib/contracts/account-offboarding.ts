import type { UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';

export type OffboardingScope =
  | { kind: 'TENANT_ACCOUNT' }
  | { kind: 'PROJECT_ACCESS'; projectId: UUID };

export interface ProjectCapabilities {
  operationalRole: ProjectRole | null;
  canAdminister: boolean;
  centralIT: boolean;
  accessDisabled: boolean;
}
export interface OffboardingBlocker {
  code: string;
  projectId: UUID;
  count: number;
  resolutionPath: string | null;
}
export interface OffboardingPreview {
  scope: OffboardingScope;
  subjectUserId: UUID;
  snapshot: string;
  alreadyDisabled: boolean;
  blockers: OffboardingBlocker[];
  centralITRecipientCount: number;
}
export interface OffboardingCommand {
  subjectUserId: UUID;
  scope: OffboardingScope;
  reason: string;
  snapshot: string;
  confirmed: true;
  /** Parsed from Idempotency-Key, never an HTTP JSON body field. */
  idempotencyKey: string;
}
export interface OffboardingResult {
  scope: OffboardingScope;
  subjectUserId: UUID;
  changed: boolean;
  eventId: UUID | null;
  disabledAt: string;
  sessionVersion: number;
  centralReview: 'QUEUED' | 'NOT_QUEUED_NO_CENTRAL_IT' | 'NOT_APPLICABLE';
  reviewId: UUID | null;
  outcome: 'DISABLED' | 'ALREADY_DISABLED' | 'ACCOUNT_ALREADY_DISABLED';
}
export interface ReviewResolution {
  reviewId: UUID;
  disposition: 'NO_FURTHER_ACTION' | 'TENANT_ACCOUNT_DISABLED';
  reason: string;
  tenantEventId: UUID | null;
  snapshot: string;
  idempotencyKey: string;
}
