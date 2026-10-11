import type { DbClient, UUID } from '@/shared/types';
import type { PromotionWorkItem } from '../domain/promotion-work';

/**
 * Decision 57 / D8: the person's open requests by part. `lock` holds the rows for the
 * role-change transaction so the reviewed versions cannot move underneath it.
 */
export async function readPromotionWork(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID, lock = false): Promise<PromotionWorkItem[]> {
  const { rows } = await db.query<{ id: string; ticket_number: string | null; description: string | null; status: string; row_version: number; chief: boolean; instrument: boolean; reviewer: boolean }>(
    `SELECT id, ticket_number, description, status, row_version,
       assigned_party_chief_id = $3 AS chief, assigned_instrument_man_id = $3 AS instrument,
       (field_validation_reviewer_id = $3 AND status = 'PENDING_FIELD_VALIDATION') AS reviewer
     FROM tickets WHERE tenant_id = $1 AND project_id = $2
       AND status IN ('APPROVED','ASSIGNED','IN_PROGRESS','DELAYED','PENDING_PC_APPROVAL','PENDING_FIELD_VALIDATION')
       AND (assigned_party_chief_id = $3 OR assigned_instrument_man_id = $3 OR field_validation_reviewer_id = $3)
     ORDER BY ticket_number NULLS LAST, id${lock ? ' FOR UPDATE' : ''}`, [tenantId, projectId, userId]);
  return rows.flatMap(row => {
    const base = { ticketId: row.id, ticketNumber: row.ticket_number, description: row.description, status: row.status, rowVersion: Number(row.row_version) };
    return [
      ...(row.chief ? [{ ...base, part: 'CHIEF' as const }] : []),
      ...(row.instrument ? [{ ...base, part: 'INSTRUMENT' as const }] : []),
      ...(row.reviewer ? [{ ...base, part: 'REVIEWER' as const }] : []),
    ];
  });
}

/** Active, eligible people who can take over crew work (never the person whose role changes). */
export async function readReplacementCandidates(db: DbClient, tenantId: UUID, projectId: UUID, excludeUserId: UUID) {
  const { rows } = await db.query<{ id: string; name: string; role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN' }>(
    `SELECT u.id, u.name, pm.role FROM project_memberships pm
     JOIN users u ON u.id = pm.user_id AND u.tenant_id = $1
     JOIN companies c ON c.id = u.company_id AND c.tenant_id = u.tenant_id AND c.type <> 'SUBCONTRACTOR'
     WHERE pm.project_id = $2 AND pm.role IN ('PARTY_CHIEF','INSTRUMENT_MAN') AND pm.user_id <> $3
       AND pm.access_disabled_at IS NULL AND u.deactivated_at IS NULL
     ORDER BY lower(u.name), u.id LIMIT 500`, [tenantId, projectId, excludeUserId]);
  return {
    partyChiefs: rows.filter(row => row.role === 'PARTY_CHIEF').map(({ id, name }) => ({ id, name })),
    instrumentMen: rows.filter(row => row.role === 'INSTRUMENT_MAN').map(({ id, name }) => ({ id, name })),
  };
}
