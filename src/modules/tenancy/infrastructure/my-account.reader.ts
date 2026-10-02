import type { DbClient, UUID } from '@/shared/types';
import type { MyAccountReader } from '../application/my-account';

export class SqlMyAccountReader implements MyAccountReader {
  async profile(db: DbClient, tenantId: UUID, userId: UUID) {
    const { rows } = await db.query<{ name: string; email: string; company: string }>(
      `SELECT u.name, u.email, c.name AS company FROM users u
       JOIN companies c ON c.id = u.company_id AND c.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.id = $2 AND u.deactivated_at IS NULL`, [tenantId, userId]);
    return rows[0] ?? null;
  }
  async assignment(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID) {
    const { rows: areas } = await db.query<{ name: string }>(
      `SELECT DISTINCT n.name FROM aor_assignments a
       JOIN aor_nodes n ON n.id = a.aor_node_id AND n.tenant_id = a.tenant_id AND n.project_id = a.project_id
       WHERE a.tenant_id = $1 AND a.project_id = $2 AND a.user_id = $3
         AND a.deactivated_at IS NULL AND n.retired_at IS NULL
         AND EXISTS(SELECT 1 FROM project_memberships pm JOIN users current_user_record ON current_user_record.id=pm.user_id AND current_user_record.tenant_id=$1
           WHERE pm.project_id=$2 AND pm.user_id=$3 AND pm.access_disabled_at IS NULL AND current_user_record.deactivated_at IS NULL) ORDER BY n.name`, [tenantId, projectId, userId]);
    const { rows: crew } = await db.query<{ name: string; role: string }>(
      `SELECT DISTINCT u.name, CASE WHEN r.party_chief_id = $3 THEN 'Instrument Man' ELSE 'Party Chief' END AS role
       FROM crew_rosters r
       JOIN users u ON u.id = CASE WHEN r.party_chief_id = $3 THEN r.instrument_man_id ELSE r.party_chief_id END
         AND u.tenant_id = r.tenant_id AND u.deactivated_at IS NULL
       WHERE r.tenant_id = $1 AND r.project_id = $2 AND r.deactivated_at IS NULL
         AND EXISTS(SELECT 1 FROM project_memberships pm JOIN users current_user_record ON current_user_record.id=pm.user_id AND current_user_record.tenant_id=$1
           WHERE pm.project_id=$2 AND pm.user_id=$3 AND pm.access_disabled_at IS NULL AND current_user_record.deactivated_at IS NULL)
         AND EXISTS(SELECT 1 FROM project_memberships partner WHERE partner.project_id=$2 AND partner.user_id=u.id AND partner.access_disabled_at IS NULL)
         AND (r.party_chief_id = $3 OR r.instrument_man_id = $3) ORDER BY role, u.name`, [tenantId, projectId, userId]);
    return { areas: areas.map(area => area.name), crew };
  }
}
