import type { DbClient, UUID } from '@/shared/types';
import type {
  ContinuityHealthRepositoryPort, CrewVacancySignal,
} from '../application/continuity-health';

interface VacancyRow {
  event_id: UUID; user_id: UUID;
  role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN'; detected_at: Date;
  open_ticket_count: string; uncovered_crew_count: string;
}

export class ContinuityHealthRepository implements ContinuityHealthRepositoryPort {
  async listUnresolvedCrewVacancies(db: DbClient, tenantId: UUID,
    projectId: UUID): Promise<CrewVacancySignal[]> {
    const { rows } = await db.query<VacancyRow>(
      `WITH candidates AS (
         SELECT e.id AS event_id,u.id AS user_id,pm.role,
           e.created_at AS detected_at
         FROM tenant_events e
         JOIN users u ON u.tenant_id=e.tenant_id
           AND u.id::text=e.payload->>'userId' AND u.deactivated_at IS NOT NULL
         JOIN project_memberships pm ON pm.user_id=u.id
           AND pm.project_id=$2 AND pm.role IN ('PARTY_CHIEF','INSTRUMENT_MAN')
         WHERE e.tenant_id=$1 AND e.event_type='user.deactivated'
         UNION ALL
         SELECT e.id AS event_id,u.id AS user_id,
           e.payload->>'oldRole' AS role,e.created_at AS detected_at
         FROM tenant_events e
         JOIN users u ON u.tenant_id=e.tenant_id
           AND u.id::text=e.payload->>'userId'
         LEFT JOIN project_memberships current_pm
           ON current_pm.project_id=$2 AND current_pm.user_id=u.id
         WHERE e.tenant_id=$1 AND e.event_type='user.role_changed'
           AND e.payload->>'projectId'=$2::text
           AND e.payload->>'oldRole' IN ('PARTY_CHIEF','INSTRUMENT_MAN')
           AND current_pm.role IS DISTINCT FROM e.payload->>'oldRole'
       ), latest AS (
         SELECT DISTINCT ON (user_id,role) event_id,user_id,role,detected_at
         FROM candidates ORDER BY user_id,role,detected_at DESC,event_id DESC
       )
       SELECT v.event_id,v.user_id,v.role,v.detected_at,
         tickets.open_ticket_count,crew.uncovered_crew_count
       FROM latest v
       JOIN projects p ON p.id=$2 AND p.tenant_id=$1 AND p.status='ACTIVE'
       CROSS JOIN LATERAL (
         SELECT count(*) AS open_ticket_count FROM tickets t
         WHERE t.tenant_id=$1 AND t.project_id=$2
           AND t.status IN ('ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED')
           AND ((v.role='PARTY_CHIEF' AND t.assigned_party_chief_id=v.user_id)
             OR (v.role='INSTRUMENT_MAN' AND t.assigned_instrument_man_id=v.user_id))
       ) tickets
       CROSS JOIN LATERAL (
         SELECT count(*) AS uncovered_crew_count FROM crew_rosters old_roster
         WHERE old_roster.tenant_id=$1 AND old_roster.project_id=$2
           AND ((v.role='PARTY_CHIEF' AND old_roster.party_chief_id=v.user_id
             AND EXISTS (
               SELECT 1 FROM users im JOIN project_memberships im_pm
                 ON im_pm.project_id=$2 AND im_pm.user_id=im.id
                 AND im_pm.role='INSTRUMENT_MAN'
               WHERE im.id=old_roster.instrument_man_id
                 AND im.tenant_id=$1 AND im.deactivated_at IS NULL)
             AND NOT EXISTS (
               SELECT 1 FROM crew_rosters replacement
               JOIN users pc ON pc.id=replacement.party_chief_id
                 AND pc.tenant_id=$1 AND pc.deactivated_at IS NULL
               JOIN project_memberships pc_pm
                 ON pc_pm.project_id=$2 AND pc_pm.user_id=pc.id
                 AND pc_pm.role='PARTY_CHIEF'
               WHERE replacement.tenant_id=$1 AND replacement.project_id=$2
                 AND replacement.instrument_man_id=old_roster.instrument_man_id
                 AND replacement.deactivated_at IS NULL))
             OR (v.role='INSTRUMENT_MAN'
               AND old_roster.instrument_man_id=v.user_id
               AND EXISTS (
                 SELECT 1 FROM users pc JOIN project_memberships pc_pm
                   ON pc_pm.project_id=$2 AND pc_pm.user_id=pc.id
                   AND pc_pm.role='PARTY_CHIEF'
                 WHERE pc.id=old_roster.party_chief_id
                   AND pc.tenant_id=$1 AND pc.deactivated_at IS NULL)
               AND NOT EXISTS (
                 SELECT 1 FROM crew_rosters replacement
                 JOIN users im ON im.id=replacement.instrument_man_id
                   AND im.tenant_id=$1 AND im.deactivated_at IS NULL
                 JOIN project_memberships im_pm
                   ON im_pm.project_id=$2 AND im_pm.user_id=im.id
                   AND im_pm.role='INSTRUMENT_MAN'
                 WHERE replacement.tenant_id=$1 AND replacement.project_id=$2
                   AND replacement.party_chief_id=old_roster.party_chief_id
                   AND replacement.deactivated_at IS NULL))
           )
       ) crew
       WHERE tickets.open_ticket_count>0 OR crew.uncovered_crew_count>0
       ORDER BY v.detected_at,v.event_id`,
      [tenantId, projectId]);
    return rows.map((row) => ({ eventId: row.event_id,
      userId: row.user_id, role: row.role, detectedAt: row.detected_at,
      openTicketCount: Number(row.open_ticket_count),
      uncoveredCrewCount: Number(row.uncovered_crew_count) }));
  }
}
