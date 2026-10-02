import type { DbClient, UUID } from '@/shared/types';
import type { AuthContext } from '@/lib/auth';
import type { OffboardingCommand, OffboardingResult, OffboardingScope, OffboardingBlocker } from '@/lib/contracts/account-offboarding';
import type { OffboardingRepository, OffboardingState } from '../application/account-offboarding';
import { appendLifecycleEvent } from './account-lifecycle.repository';

// One statement supplies deterministic, bounded evidence. The tenant barrier prevents duty phantoms during commands.
const duties = [
  ['AREA_ASSIGNMENT', 'aor_assignments', "d.user_id=$2 AND d.department_id IS NULL AND d.deactivated_at IS NULL", 'survey/teams'],
  ['CREW_ROSTER', 'crew_rosters', '(d.party_chief_id=$2 OR d.instrument_man_id=$2) AND d.deactivated_at IS NULL', 'survey/teams'],
  ['REPORTING_LINK', 'survey_reporting_links', '(d.superintendent_id=$2 OR d.party_chief_id=$2) AND d.deactivated_at IS NULL', 'survey/teams'],
  ['TEAM_MEMBERSHIP', 'survey_team_members', 'd.user_id=$2 AND d.deactivated_at IS NULL', 'survey/teams'],
  ['TEAM_LEAD', 'survey_teams', 'd.lead_user_id=$2 AND d.deactivated_at IS NULL', 'survey/teams'],
  ['RESPONSIBILITY_GRANT', 'project_responsibility_grants', 'd.user_id=$2 AND d.revoked_at IS NULL', 'admin'],
  ['COMPANY_AUTHORITY', 'company_authority_grants', 'd.user_id=$2 AND d.revoked_at IS NULL', 'admin'],
  ['ACTING_GRANT', 'acting_grants', 'd.user_id=$2 AND d.revoked_at IS NULL', null],
  ['DEPARTMENT_RELATIONSHIP', 'department_memberships', '(d.user_id=$2 OR d.superintendent_id=$2) AND d.deactivated_at IS NULL', null],
  ['HELP_FLAG', 'help_flags', "d.raised_by=$2 AND d.status='ACTIVE'", null],
  ['TICKET_DUTY', 'tickets', "(d.assigned_party_chief_id=$2 OR d.assigned_instrument_man_id=$2 OR d.survey_lead_id=$2) AND d.status NOT IN ('DRAFT','COMPLETED','CLOSED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED')", 'requests'],
] as const;
const dutySql = duties.map(([code, table, predicate, path]) => `SELECT '${code}'::text AS code,d.project_id AS "projectId",to_jsonb(d) AS evidence,
  ${path ? "'/projects/'||d.project_id::text||'/'||'"+path+"'" : 'NULL::text'} AS "resolutionPath"
  FROM ${table} d JOIN scoped_projects p ON p.id=d.project_id WHERE d.tenant_id=$1 AND p.status<>'ARCHIVED' AND ${predicate}`).join(' UNION ALL ');

export class AccountOffboardingRepository implements OffboardingRepository {
  async readState(db: DbClient, auth: AuthContext, scope: OffboardingScope, subject: UUID, offset = 0): Promise<OffboardingState | null> {
    const { rows } = await db.query<{ state: OffboardingState }>(`WITH scoped_projects AS (
      SELECT id,status FROM projects WHERE tenant_id=$1 AND ($3::uuid IS NULL OR id=$3)
    ), members AS (
      SELECT pm.* FROM project_memberships pm JOIN scoped_projects p ON p.id=pm.project_id WHERE pm.user_id=$2
    ), central AS (
      SELECT u.id FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id AND u.tenant_id=tm.tenant_id
      JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
      WHERE tm.tenant_id=$1 AND tm.role='TENANT_ADMIN' AND u.deactivated_at IS NULL AND c.type IN ('GC','OWNER_REP')
    ), managers AS (
      SELECT pm.project_id,pm.user_id FROM project_memberships pm JOIN scoped_projects p ON p.id=pm.project_id
      JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
      WHERE pm.role='SURVEY_MANAGER' AND pm.access_disabled_at IS NULL AND u.deactivated_at IS NULL
        AND c.type IN ('GC','OWNER_REP') AND p.status<>'ARCHIVED'
    ), raw_duties AS (${dutySql}
      UNION ALL SELECT 'ACTING_DESIGNATION',pm.project_id,to_jsonb(pm),NULL::text FROM members pm
        JOIN scoped_projects p ON p.id=pm.project_id WHERE pm.designated_acting_for IS NOT NULL AND p.status<>'ARCHIVED'
      UNION ALL SELECT 'LEGACY_AREA_MEMBERSHIP',d.project_id,to_jsonb(d),NULL::text FROM area_memberships d
        JOIN scoped_projects p ON p.id=d.project_id WHERE d.user_id=$2 AND p.status<>'ARCHIVED'
      UNION ALL SELECT 'CAD_DUTY',t.project_id,to_jsonb(d),NULL::text FROM cad_work d
        JOIN tickets t ON t.id=d.ticket_id AND t.tenant_id=d.tenant_id JOIN scoped_projects p ON p.id=t.project_id
        WHERE d.tenant_id=$1 AND d.cad_assigned_to=$2 AND d.cad_status NOT IN ('NOT_REQUIRED','COMPLETE') AND p.status<>'ARCHIVED'
      UNION ALL SELECT 'LAST_SURVEY_MANAGER',m.project_id,to_jsonb(m),'/projects/'||m.project_id::text||'/admin'
        FROM managers m WHERE m.user_id=$2 AND NOT EXISTS(SELECT 1 FROM managers other WHERE other.project_id=m.project_id AND other.user_id<>$2)
      UNION ALL SELECT 'LAST_TENANT_ADMIN',NULL::uuid,jsonb_build_object('id',$2::uuid),NULL::text
        WHERE $3::uuid IS NULL AND (SELECT count(*) FROM central)=1 AND EXISTS(SELECT 1 FROM central WHERE id=$2)
    ), grouped AS (
      SELECT code,"projectId",count(*)::int AS count,"resolutionPath" FROM raw_duties GROUP BY code,"projectId","resolutionPath"
    ), principal AS (
      SELECT u.id,u.name,u.email,u.company_id,u.session_version,u.deactivated_at,c.type FROM users u
      JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id WHERE u.tenant_id=$1 AND u.id=$2
    ) SELECT jsonb_build_object(
      'subject',jsonb_build_object('id',u.id,'companyId',u.company_id,'companyType',u.type,'sessionVersion',u.session_version,'disabledAt',u.deactivated_at),
      'membership',CASE WHEN $3::uuid IS NULL THEN NULL ELSE (SELECT jsonb_build_object('disabledAt',pm.access_disabled_at) FROM members pm WHERE pm.project_id=$3) END,
      'blockerTotal',(SELECT count(*)::int FROM grouped),
      'blockers',COALESCE((SELECT jsonb_agg(g ORDER BY code,"projectId") FROM (SELECT * FROM grouped ORDER BY code,"projectId" NULLS FIRST LIMIT 25 OFFSET $5) g),'[]'),
      'centralITRecipients',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM central),'[]'),
      'evidence',jsonb_build_object('principal',to_jsonb(u),
        'projects',COALESCE((SELECT encode(sha256(convert_to(string_agg(encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex'),'' ORDER BY id),'UTF8')),'hex') FROM scoped_projects p),'EMPTY'),
        'memberships',COALESCE((SELECT encode(sha256(convert_to(string_agg(encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),'' ORDER BY project_id,id),'UTF8')),'hex') FROM members m),'EMPTY'),
        'duties',COALESCE((SELECT encode(sha256(convert_to(string_agg(witness,'' ORDER BY witness),'UTF8')),'hex') FROM (SELECT encode(sha256(convert_to(jsonb_build_array(code,"projectId",evidence)::text,'UTF8')),'hex') AS witness FROM raw_duties) d),'EMPTY'),
        'managers',COALESCE((SELECT encode(sha256(convert_to(string_agg(to_jsonb(m)::text,'' ORDER BY project_id,user_id),'UTF8')),'hex') FROM managers m),'EMPTY'),
        'central',COALESCE((SELECT encode(sha256(convert_to(string_agg(id::text,'' ORDER BY id),'UTF8')),'hex') FROM central),'EMPTY'),
        'adminGrants',COALESCE((SELECT encode(sha256(convert_to(string_agg(to_jsonb(g)::text,'' ORDER BY g.id),'UTF8')),'hex') FROM project_admin_grants g JOIN scoped_projects p ON p.id=g.project_id WHERE g.tenant_id=$1 AND g.user_id IN ($2,$4)),'EMPTY'),
        'authority', (SELECT jsonb_build_object('branch',CASE WHEN EXISTS(SELECT 1 FROM central WHERE id=$4) THEN 'CENTRAL_IT' ELSE 'PROJECT_ADMIN' END,
          'tenantMembership',(SELECT jsonb_build_object('id',tm.id,'role',tm.role) FROM tenant_memberships tm WHERE tm.tenant_id=$1 AND tm.user_id=$4),
          'projectMembership',(SELECT jsonb_build_object('id',pm.id,'projectId',pm.project_id,'role',pm.role,'disabledAt',pm.access_disabled_at) FROM project_memberships pm WHERE pm.project_id=$3 AND pm.user_id=$4),
          'projectAdminGrant',(SELECT jsonb_build_object('id',g.id,'origin',g.origin,'grantedBy',g.granted_by,'grantedAt',g.granted_at) FROM project_admin_grants g WHERE g.tenant_id=$1 AND g.project_id=$3 AND g.user_id=$4 AND g.revoked_at IS NULL))),
        'continuity',jsonb_build_object('targetManagerProjects',(SELECT count(*) FROM managers WHERE user_id=$2),
          'uncoveredProjects',(SELECT count(*) FROM managers m WHERE m.user_id=$2 AND NOT EXISTS(SELECT 1 FROM managers other WHERE other.project_id=m.project_id AND other.user_id<>$2)),
          'witnessSample',COALESCE((SELECT jsonb_agg(w ORDER BY project_id) FROM (SELECT m.project_id,min(other.user_id::text)::uuid AS replacement_user_id
            FROM managers m JOIN managers other ON other.project_id=m.project_id AND other.user_id<>$2 WHERE m.user_id=$2 GROUP BY m.project_id ORDER BY m.project_id LIMIT 25) w),'[]'),
          'sampleLimit',25),
        'actor', (SELECT jsonb_build_object('companyId',actor.company_id,'version',actor.session_version,
          'tenantRole',(SELECT role FROM tenant_memberships tm WHERE tm.tenant_id=$1 AND tm.user_id=$4)) FROM users actor WHERE actor.id=$4 AND actor.tenant_id=$1)
      )) AS state FROM principal u WHERE $3::uuid IS NULL OR EXISTS(SELECT 1 FROM members WHERE project_id=$3)`,
      [auth.tenantId, subject, scope.kind === 'PROJECT_ACCESS' ? scope.projectId : null, auth.userId, offset]);
    const state=rows[0]?.state ?? null;
    return state;
  }

  async disable(db: DbClient, auth: AuthContext, command: OffboardingCommand, state: OffboardingState): Promise<OffboardingResult> {
    const global=command.scope.kind==='TENANT_ACCOUNT';
    const projectId=command.scope.kind==='PROJECT_ACCESS'?command.scope.projectId:null;
    const alreadyGlobal=!!state.subject.disabledAt;
    const disabledAt=state.subject.disabledAt ?? state.membership?.disabledAt;
    if (disabledAt) {
      const {rows}=await db.query<{id:UUID;review_id:UUID|null;recipient_ids:UUID[]|null}>(`SELECT e.id,r.id AS review_id,r.recipient_ids FROM account_lifecycle_events e
        LEFT JOIN account_offboarding_reviews r ON r.local_event_id=e.id AND r.tenant_id=e.tenant_id
        WHERE e.tenant_id=$1 AND e.subject_user_id=$2 AND e.scope=$3 AND e.project_id IS NOT DISTINCT FROM $4::uuid ORDER BY e.occurred_at,e.id LIMIT 1`,
        [auth.tenantId,command.subjectUserId,alreadyGlobal?'TENANT_ACCOUNT':command.scope.kind,alreadyGlobal||global?null:projectId]);
      const event=rows[0];
      return {scope:command.scope,subjectUserId:command.subjectUserId,changed:false,eventId:event?.id??null,disabledAt,
        sessionVersion:state.subject.sessionVersion,reviewId:event?.review_id??null,
        centralReview:global||alreadyGlobal?'NOT_APPLICABLE':event?.review_id?'QUEUED':'NOT_QUEUED_NO_CENTRAL_IT',
        outcome:!global&&alreadyGlobal?'ACCOUNT_ALREADY_DISABLED':'ALREADY_DISABLED'};
    }
    const version=state.subject.sessionVersion+1;
    const {rows}=global
      ? await db.query<{at:string}>(`UPDATE users SET deactivated_at=NOW(),deactivated_by=$3,session_version=session_version+1
          WHERE tenant_id=$1 AND id=$2 AND deactivated_at IS NULL RETURNING deactivated_at::text AS at`,[auth.tenantId,command.subjectUserId,auth.userId])
      : await db.query<{at:string}>(`UPDATE project_memberships pm SET access_disabled_at=NOW(),access_disabled_by=$4 FROM projects p
          WHERE p.id=pm.project_id AND p.tenant_id=$1 AND pm.project_id=$2 AND pm.user_id=$3 AND pm.access_disabled_at IS NULL RETURNING pm.access_disabled_at::text AS at`,
          [auth.tenantId,projectId,command.subjectUserId,auth.userId]);
    if (!rows[0]) throw new Error('Coordinated lifecycle conditional update failed');
    if (!global) await db.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[auth.tenantId,command.subjectUserId]);
    const eventId=await appendLifecycleEvent(db,{scope:command.scope,tenantId:auth.tenantId,actorUserId:auth.userId,subjectUserId:command.subjectUserId,
      projectId,reason:command.reason,priorState:'ACTIVE',newState:'DISABLED',priorSessionVersion:state.subject.sessionVersion,
      newSessionVersion:version,authorityEvidence:{actorId:auth.userId,scope:command.scope,previewEvidence:state.evidence},snapshot:command.snapshot,correlationKey:command.idempotencyKey});
    let reviewId:UUID|null=null;
    if (!global && state.centralITRecipients.length) {
      const review=(await db.query<{id:UUID}>(`INSERT INTO account_offboarding_reviews(tenant_id,project_id,subject_user_id,requested_by,local_event_id,reason,recipient_ids)
        VALUES($1,$2,$3,$4,$5,$6,$7::uuid[]) RETURNING id`,[auth.tenantId,projectId,command.subjectUserId,auth.userId,eventId,command.reason,state.centralITRecipients])).rows[0];
      if (!review) throw new Error('Offboarding review identity unavailable');
      reviewId=review.id;
      await db.query(`INSERT INTO administrative_notification_outbox(tenant_id,review_id,recipient_id)
        SELECT $1,$2,recipient FROM unnest($3::uuid[]) recipient`,[auth.tenantId,reviewId,state.centralITRecipients]);
    }
    return {scope:command.scope,subjectUserId:command.subjectUserId,changed:true,eventId,disabledAt:rows[0].at,sessionVersion:version,reviewId,
      centralReview:global?'NOT_APPLICABLE':reviewId?'QUEUED':'NOT_QUEUED_NO_CENTRAL_IT',outcome:'DISABLED'};
  }
}
