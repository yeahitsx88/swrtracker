import {ConflictError, ValidationError} from '@/shared/errors';
import type {DbClient, UUID} from '@/shared/types';

export interface RequesterInvitationInput {
  tenantId: UUID; projectId: UUID; companyId: UUID; email: string; invitedBy: UUID;
}
export interface RequesterInvitationWriter {
  isProjectOpen(db: DbClient, tenantId: UUID, projectId: UUID): Promise<boolean>;
  isRequesterCompanyAvailable(db: DbClient, tenantId: UUID, projectId: UUID, companyId: UUID): Promise<boolean>;
  hasRegisteredEmail(db: DbClient, tenantId: UUID, email: string): Promise<boolean>;
  hasPendingRequesterInvite(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<boolean>;
  createRequesterInvite(db: DbClient, input: RequesterInvitationInput & {expiresAt: Date}): Promise<{token: UUID} | null>;
}
/** Caller holds the tenant EXCLUSIVE transaction and current project administration authority. */
export async function issueRequesterInvitation(repo: RequesterInvitationWriter, db: DbClient, input: RequesterInvitationInput) {
  const email=input.email.trim().toLowerCase();
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('Enter a valid requester email.');
  if(!await repo.isProjectOpen(db,input.tenantId,input.projectId)) throw new ConflictError('This project no longer accepts invitations.');
  if(!await repo.isRequesterCompanyAvailable(db,input.tenantId,input.projectId,input.companyId)) throw new ValidationError('Choose a company associated with this project.');
  if(await repo.hasRegisteredEmail(db,input.tenantId,email)) throw new ConflictError('This email already has a tenant account. Add the existing person as a project member.');
  if(await repo.hasPendingRequesterInvite(db,input.tenantId,input.projectId,email)) throw new ConflictError('An active invitation already exists for this email on this project.');
  const expiresAt=new Date(Date.now()+7*24*60*60*1000);
  const invite=await repo.createRequesterInvite(db,{...input,email,expiresAt});
  if(!invite) throw new ValidationError('Choose a company associated with this project.');
  return {invite,email,expiresAt};
}
