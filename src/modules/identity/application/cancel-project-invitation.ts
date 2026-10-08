import {ConflictError,ForbiddenError,ValidationError} from '@/shared/errors';
import {resolveProjectCapabilities} from '@/lib/project-capabilities';
import {assertRecommissioningMutation} from '@/lib/recommissioning-gate';
import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';
export interface InvitationCancellationCommand {snapshot:string;reason:string;confirmed:true}
export interface InvitationCancellationPreview {id:string;email:string;role:string;companyName:string;expiresAt:string;acceptedAt:string|null;canceledAt:string|null;projectStatus:string;canCancel:boolean;snapshot:string}
export interface InvitationCancellationRepository {
 preview(db:DbClient,auth:AuthContext,projectId:UUID,inviteId:UUID):Promise<InvitationCancellationPreview>;
 cancel(db:DbClient,auth:AuthContext,projectId:UUID,inviteId:UUID,command:InvitationCancellationCommand,preview:InvitationCancellationPreview):Promise<{inviteId:string;canceledAt:string}>;
}
export function parseInvitationCancellation(value:unknown):InvitationCancellationCommand {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('Review and confirm invitation cancellation.');
 const b=value as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['snapshot','reason','confirmed'].includes(k))||typeof b.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(b.snapshot)||typeof b.reason!=='string'||b.reason.trim().length<10||b.reason.trim().length>1000||/[\x00-\x1f]/.test(b.reason)||b.confirmed!==true)throw new ValidationError('Current evidence, a reason (10–1000 characters) and explicit confirmation are required.');
 return {snapshot:b.snapshot,reason:b.reason.trim(),confirmed:true};
}
export async function requireInvitationCancellationAuthority(db:DbClient,auth:AuthContext,projectId:UUID){
 if(!(await resolveProjectCapabilities(db,auth,projectId)).centralIT)throw new ForbiddenError('Only Central IT may cancel pending invitations.');
}
/** Current authority and phase precede the ledger; only fresh execution checks pending state. */
export async function authorizeInvitationCancellation(db:DbClient,auth:AuthContext,projectId:UUID,inviteId:UUID){
 await requireInvitationCancellationAuthority(db,auth,projectId);
 await assertRecommissioningMutation(db,auth.tenantId,projectId,`/api/projects/${projectId}/invites/${inviteId}/cancel`);
}
export async function cancelProjectInvitation(repo:InvitationCancellationRepository,db:DbClient,auth:AuthContext,projectId:UUID,inviteId:UUID,command:InvitationCancellationCommand){
 const preview=await repo.preview(db,auth,projectId,inviteId);
 if(preview.snapshot!==command.snapshot)throw new ConflictError('Invitation evidence changed. Reload the invitation and renew consent.','STALE_INVITATION');
 if(!preview.canCancel)throw new ConflictError('Only a pending, unexpired invitation on an editable project may be cancelled. Reload the invitation.','INVITATION_NOT_PENDING');
 return repo.cancel(db,auth,projectId,inviteId,command,preview);
}
