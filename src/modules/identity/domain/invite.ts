import type { UUID } from '@/shared/types';
import type { ProjectRole } from './types';

export interface Invite {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  companyId: UUID | null;
  email: string;
  role: ProjectRole;
  token: UUID;
  invitedBy: UUID;
  acceptedAt: Date | null;
  expiresAt: Date;
  canceledAt: Date | null;
  canceledBy: UUID | null;
  createdAt: Date;
}

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELED' | 'UNBOUND';

export function inviteStatus(invite: Invite, now: Date): InviteStatus {
  if (invite.acceptedAt) return 'ACCEPTED';
  if (invite.canceledAt) return 'CANCELED';
  if (!invite.companyId) return 'UNBOUND';
  if (invite.expiresAt <= now) return 'EXPIRED';
  return 'PENDING';
}

export function publicInvite(invite: Invite, now: Date) {
  const { token: _token, ...safe } = invite;
  return { ...safe, status: inviteStatus(invite, now) };
}
