import {randomUUID} from 'node:crypto';
import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';
export type AdministrativeEventType =
  | 'project.member_added' | 'project.role_changed' | 'project.admin_granted' | 'project.admin_revoked'
  | 'project.company_registered' | 'project.company_associated' | 'project.company_removed' | 'project.archived' | 'project.activated'
  | 'project.configuration_changed' | 'tenant.membership_changed' | 'tenant.membership_removed'
  | 'user.invited' | 'user.registered' | 'user.provisioned' | 'password.reset_requested' | 'password.reset_completed'
  | 'session.logged_out' | 'tenant.company_created' | 'project.created'
  | 'account.appearance_changed' | 'tenant.appearance_changed' | 'project.recommissioning_started' | 'project.recommissioned'
  | 'tenant.template_created' | 'tenant.template_updated' | 'tenant.template_deleted'
  | 'tenant.custom_role_created' | 'tenant.custom_role_updated' | 'tenant.custom_role_deleted' | 'project.access_restored'
  | 'support.created' | 'support.updated';
/** Same held transaction as the administrative effect; never include passwords or bearer/reset tokens. */
export async function appendAdministrativeEvent(db:DbClient,input:{
  auth:Pick<AuthContext,'tenantId'|'userId'>|{tenantId:UUID;userId:null}; projectId:UUID|null; subjectUserId:UUID|null;
  eventType:AdministrativeEventType; authorityEvidence:Record<string,unknown>; changes:Record<string,unknown>;
}):Promise<UUID>{
  const id=randomUUID() as UUID;
  await db.query(
    `INSERT INTO administrative_events
      (id,tenant_id,project_id,actor_id,subject_user_id,event_type,authority_evidence,changes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id,input.auth.tenantId,input.projectId,input.auth.userId,input.subjectUserId,input.eventType,
      JSON.stringify(input.authorityEvidence),JSON.stringify(input.changes)]);
  return id;
}
