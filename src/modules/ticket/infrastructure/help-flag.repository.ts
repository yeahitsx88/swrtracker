import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { HelpFlag, VisibleHelpFlag, HelpFlagRepositoryPort } from '../application/help-flags';

interface FlagRow {
  id: UUID; tenant_id: UUID; project_id: UUID; raised_by: UUID;
  level: 1 | 2; status: 'ACTIVE' | 'CLEARED'; reason: string | null;
  escalated_from: UUID | null; affected_ticket_ids: UUID[];
}

function mapFlag(row: FlagRow): HelpFlag {
  return { id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
    raisedBy: row.raised_by, level: row.level, status: row.status,
    reason: row.reason, escalatedFrom: row.escalated_from,
    affectedTicketIds: row.affected_ticket_ids };
}

export class HelpFlagRepository implements HelpFlagRepositoryPort {
  async activeProject(db: DbClient, tenantId: UUID, projectId: UUID): Promise<boolean> {
    const { rows } = await db.query(
      `SELECT 1 FROM projects WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
      [projectId, tenantId]);
    return rows.length > 0;
  }

  async crewChief(db: DbClient, tenantId: UUID, projectId: UUID,
    instrumentManId: UUID): Promise<UUID | null> {
    const { rows } = await db.query<{ party_chief_id: UUID }>(
      `SELECT cr.party_chief_id FROM crew_rosters cr
       JOIN projects p ON p.id=cr.project_id AND p.tenant_id=cr.tenant_id
         AND p.status='ACTIVE'
       JOIN users im ON im.id=cr.instrument_man_id AND im.tenant_id=cr.tenant_id
         AND im.deactivated_at IS NULL
       JOIN users pc ON pc.id=cr.party_chief_id AND pc.tenant_id=cr.tenant_id
         AND pc.deactivated_at IS NULL
       JOIN project_memberships pm ON pm.project_id=cr.project_id
         AND pm.user_id=cr.party_chief_id AND pm.role='PARTY_CHIEF'
       WHERE cr.tenant_id=$1 AND cr.project_id=$2
         AND cr.instrument_man_id=$3 AND cr.deactivated_at IS NULL`,
      [tenantId, projectId, instrumentManId]);
    return rows[0]?.party_chief_id ?? null;
  }

  async snapshot(db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, level: 1 | 2): Promise<UUID[]> {
    const column = level === 1 ? 'assigned_instrument_man_id' : 'assigned_party_chief_id';
    const { rows } = await db.query<{ id: UUID }>(
      `SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2
         AND ${column}=$3
         AND status IN ('ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED')
       ORDER BY created_at,id`, [tenantId, projectId, actorId]);
    return rows.map((row) => row.id);
  }

  async activeFlagForActor(db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, level: 1 | 2): Promise<HelpFlag | null> {
    const { rows } = await db.query<FlagRow>(
      `SELECT * FROM help_flags WHERE tenant_id=$1 AND project_id=$2
         AND raised_by=$3 AND level=$4 AND status='ACTIVE' LIMIT 1`,
      [tenantId, projectId, actorId, level]);
    return rows[0] ? mapFlag(rows[0]) : null;
  }

  async saveFlag(db: DbClient, flag: HelpFlag): Promise<void> {
    await db.query(
      `INSERT INTO help_flags
         (id,tenant_id,project_id,raised_by,level,reason,status,
          escalated_from,affected_ticket_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [flag.id, flag.tenantId, flag.projectId, flag.raisedBy,
        flag.level, flag.reason, flag.status, flag.escalatedFrom,
        flag.affectedTicketIds]);
  }

  async lockFlag(db: DbClient, tenantId: UUID, projectId: UUID,
    flagId: UUID): Promise<HelpFlag | null> {
    const { rows } = await db.query<FlagRow>(
      `SELECT * FROM help_flags WHERE id=$1 AND tenant_id=$2 AND project_id=$3
       FOR UPDATE`, [flagId, tenantId, projectId]);
    return rows[0] ? mapFlag(rows[0]) : null;
  }

  async findEscalation(db: DbClient, tenantId: UUID, projectId: UUID,
    sourceId: UUID): Promise<HelpFlag | null> {
    const { rows } = await db.query<FlagRow>(
      `SELECT * FROM help_flags WHERE tenant_id=$1 AND project_id=$2
         AND escalated_from=$3 LIMIT 1`, [tenantId, projectId, sourceId]);
    return rows[0] ? mapFlag(rows[0]) : null;
  }

  async lockTicket(db: DbClient, tenantId: UUID, projectId: UUID,
    ticketId: UUID): Promise<boolean> {
    const { rows } = await db.query(
      `SELECT id FROM tickets WHERE id=$1 AND tenant_id=$2 AND project_id=$3
       FOR UPDATE`, [ticketId, tenantId, projectId]);
    return rows.length > 0;
  }

  async activeFlagsForTicket(db: DbClient, tenantId: UUID, projectId: UUID,
    ticketId: UUID): Promise<HelpFlag[]> {
    const { rows } = await db.query<FlagRow>(
      `SELECT * FROM help_flags WHERE tenant_id=$1 AND project_id=$2
         AND status='ACTIVE' AND affected_ticket_ids @> ARRAY[$3]::uuid[]
       ORDER BY id FOR UPDATE`, [tenantId, projectId, ticketId]);
    return rows.map(mapFlag);
  }

  async clearFlag(db: DbClient, tenantId: UUID, projectId: UUID,
    flagId: UUID, reason: 'MANUALLY_CLEARED' | 'TICKETS_REASSIGNED'): Promise<void> {
    await db.query(
      `UPDATE help_flags SET status='CLEARED',cleared_at=NOW(),
         cleared_reason=$4,updated_at=NOW()
       WHERE id=$1 AND tenant_id=$2 AND project_id=$3 AND status='ACTIVE'`,
      [flagId, tenantId, projectId, reason]);
  }

  async isResolved(db: DbClient, flag: HelpFlag): Promise<boolean> {
    const column = flag.level === 1
      ? 'assigned_instrument_man_id' : 'assigned_party_chief_id';
    const { rows } = await db.query(
      `SELECT 1 FROM tickets WHERE tenant_id=$1 AND project_id=$2
         AND id=ANY($3::uuid[]) AND ${column}=$4
         AND status IN ('ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED') LIMIT 1`,
      [flag.tenantId, flag.projectId, flag.affectedTicketIds, flag.raisedBy]);
    return rows.length === 0;
  }

  async claimFlaggedTicket(db: DbClient, flag: HelpFlag, ticketId: UUID,
    claimantId: UUID, instrumentManId: UUID): Promise<{
      oldPartyChiefId: UUID; oldInstrumentManId: UUID | null;
    } | null> {
    const { rows } = await db.query<{
      old_party_chief_id: UUID; old_instrument_man_id: UUID | null;
    }>(
      `WITH previous AS (
         SELECT t.id,t.assigned_party_chief_id AS old_party_chief_id,
           t.assigned_instrument_man_id AS old_instrument_man_id
          FROM tickets t JOIN projects p
            ON p.id=t.project_id AND p.tenant_id=t.tenant_id
          JOIN users claimant ON claimant.id=$5 AND claimant.tenant_id=t.tenant_id
          JOIN companies claimant_company ON claimant_company.id=claimant.company_id
            AND claimant_company.tenant_id=t.tenant_id
          WHERE t.id=$1 AND t.tenant_id=$2 AND t.project_id=$3
            AND t.assigned_party_chief_id=$4
            AND t.status IN ('ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED')
            AND p.status='ACTIVE'
            AND (claimant_company.type<>'SUBCONTRACTOR'
              OR t.company_id=claimant.company_id)
          FOR UPDATE OF t
       ), updated AS (
         UPDATE tickets t SET assigned_party_chief_id=$5,
           assigned_instrument_man_id=$6,updated_at=NOW()
         FROM previous v WHERE t.id=v.id AND t.tenant_id=$2
         RETURNING v.old_party_chief_id,v.old_instrument_man_id
       ) SELECT * FROM updated`,
      [ticketId, flag.tenantId, flag.projectId,
        flag.raisedBy, claimantId, instrumentManId]);
    return rows[0] ? { oldPartyChiefId: rows[0].old_party_chief_id,
      oldInstrumentManId: rows[0].old_instrument_man_id } : null;
  }

  async listVisible(db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, role: ProjectRole): Promise<VisibleHelpFlag[]> {
    if (!['INSTRUMENT_MAN','PARTY_CHIEF','SURVEY_SUPERINTENDENT',
      'SURVEY_MANAGER'].includes(role)) return [];
    const { rows } = await db.query<FlagRow & { raised_by_name: string }>(
      `SELECT h.id,h.tenant_id,h.project_id,h.raised_by,h.level,h.status,
          h.reason,h.escalated_from,raiser.name AS raised_by_name,
          CASE WHEN viewer_company.type='SUBCONTRACTOR' THEN
            (SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[])
             FROM tickets t WHERE t.id=ANY(h.affected_ticket_ids)
               AND t.tenant_id=h.tenant_id AND t.project_id=h.project_id
               AND t.company_id=viewer.company_id)
          ELSE h.affected_ticket_ids END AS affected_ticket_ids
        FROM help_flags h
        JOIN projects p ON p.id=h.project_id AND p.tenant_id=h.tenant_id
          AND p.status='ACTIVE'
        JOIN users viewer ON viewer.id=$3 AND viewer.tenant_id=h.tenant_id
        JOIN companies viewer_company ON viewer_company.id=viewer.company_id
          AND viewer_company.tenant_id=h.tenant_id
        JOIN users raiser ON raiser.id=h.raised_by AND raiser.tenant_id=h.tenant_id
        WHERE h.tenant_id=$1 AND h.project_id=$2 AND h.status='ACTIVE'
          AND (viewer_company.type<>'SUBCONTRACTOR' OR
            (raiser.company_id=viewer.company_id AND EXISTS (
              SELECT 1 FROM tickets t WHERE t.id=ANY(h.affected_ticket_ids)
                AND t.tenant_id=h.tenant_id AND t.project_id=h.project_id
                AND t.company_id=viewer.company_id)))
         AND (h.level=2 AND $4::text IN
              ('PARTY_CHIEF','SURVEY_SUPERINTENDENT','SURVEY_MANAGER')
           OR h.level=1 AND $4::text IN ('INSTRUMENT_MAN','PARTY_CHIEF')
              AND EXISTS (
                SELECT 1 FROM crew_rosters owner_roster
                JOIN crew_rosters viewer_roster
                  ON viewer_roster.tenant_id=owner_roster.tenant_id
                 AND viewer_roster.project_id=owner_roster.project_id
                 AND viewer_roster.party_chief_id=owner_roster.party_chief_id
                 AND viewer_roster.deactivated_at IS NULL
                WHERE owner_roster.tenant_id=h.tenant_id
                  AND owner_roster.project_id=h.project_id
                  AND owner_roster.instrument_man_id=h.raised_by
                  AND owner_roster.deactivated_at IS NULL
                  AND (owner_roster.party_chief_id=$3
                    OR viewer_roster.instrument_man_id=$3)))
       ORDER BY h.created_at DESC,h.id DESC`,
      [tenantId, projectId, actorId, role]);
    return rows.map(row => ({ ...mapFlag(row), raisedByName: row.raised_by_name }));
  }
}
