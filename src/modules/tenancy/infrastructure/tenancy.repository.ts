/**
 * TenancyRepository — pg implementation of ITenancyRepository.
 * All queries are scoped by tenant_id where applicable.
 */
import type { DbClient, UUID } from '@/shared/types';
import { ConflictError, NotFoundError } from '@/shared/errors';
import type {
  Tenant,
  Project,
  ProjectTemplate,
  ActingGrant,
  AorLevel,
  AorNode,
  Department,
  DepartmentTitle,
  DepartmentMembership,
  Company,
  PriorityWhitelistEntry,
} from '../domain/types';
import type { ITenancyRepository } from '../application/ports';
import type { ProjectReadinessFacts } from '../domain/project-readiness';

export class TenancyRepository implements ITenancyRepository {
  async assignCompanyDomain(
    db: DbClient, tenantId: UUID, companyId: UUID, domain: string, actorId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO allowed_domains (id, tenant_id, company_id, domain, added_by)
       SELECT gen_random_uuid(), c.tenant_id, c.id, $3, $4
       FROM companies c WHERE c.tenant_id = $1 AND c.id = $2
       ON CONFLICT (tenant_id, domain)
       DO UPDATE SET company_id = EXCLUDED.company_id, added_by = EXCLUDED.added_by
       RETURNING id`,
      [tenantId, companyId, domain, actorId],
    );
    return rows.length > 0;
  }

  async appendTenantEvent(
    db: DbClient, tenantId: UUID, actorId: UUID,
    eventType: 'domain.added' | 'whitelist.entry_added' | 'whitelist.entry_removed'
      | 'aor.level_created' | 'aor.node_created' | 'aor.node_assigned' | 'project.activated'
      | 'department.created' | 'department.member_added'
      | 'department.title_catalog_updated' | 'department.title_assigned'
      | 'acting_designee.changed' | 'acting_grant.issued' | 'acting_grant.confirmed'
      | 'acting_grant.revoked' | 'vacancy.no_survey_personnel'
      | 'project.archived' | 'user.removal_blocked'
      | 'aor.node_retired' | 'department.aor_assigned' | 'crew.roster_changed'
      | 'template.created' | 'template.updated' | 'template.deleted'
      | 'project.template_applied' | 'department.title_reassigned'
      | 'department.member_removed',
    payload: Record<string, unknown>,
  ): Promise<void> {
    await db.query(
      `INSERT INTO tenant_events (tenant_id, actor_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, actorId, eventType, JSON.stringify(payload)],
    );
  }

  async saveTenant(db: DbClient, tenant: Tenant): Promise<void> {
    await db.query(
      `INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)`,
      [tenant.id, tenant.name, tenant.createdAt],
    );
  }

  async saveCompany(db: DbClient, company: Company): Promise<void> {
    await db.query(
      `INSERT INTO companies (id, tenant_id, name, type, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [company.id, company.tenantId, company.name, company.type, company.createdAt],
    );
  }

  async saveProject(db: DbClient, project: Project): Promise<void> {
    await db.query(
      `INSERT INTO projects (id, tenant_id, name, status, crew_build, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [project.id, project.tenantId, project.name, project.status, project.crewBuild, project.createdAt],
    );
  }

  async findProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null> {
    const { rows } = await db.query<{
      id: string; tenant_id: string; name: string; status: string; crew_build: string;
      template_id: UUID | null;
      activated_at: Date | null; activated_by: string | null;
      archived_at: Date | null; archived_by: string | null; created_at: Date;
    }>(
      `SELECT id, tenant_id, name, status, crew_build, template_id,
              activated_at, activated_by,
              archived_at, archived_by, created_at
       FROM projects
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [projectId, tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id:        r.id as UUID,
      tenantId:  r.tenant_id as UUID,
      name:      r.name,
      status:    r.status as 'SETUP' | 'ACTIVE' | 'ARCHIVED',
      crewBuild: r.crew_build as 'FULL' | 'MEDIUM' | 'SLIM',
      templateId: r.template_id,
      activatedAt: r.activated_at,
      activatedBy: r.activated_by as UUID | null,
      archivedAt: r.archived_at,
      archivedBy: r.archived_by as UUID | null,
      createdAt: r.created_at,
    };
  }

  async saveProjectFromTemplate(db: DbClient, project: Project): Promise<void> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO projects
         (id, tenant_id, name, status, crew_build, template_id, created_at)
       SELECT $1, pt.tenant_id, $3, 'SETUP', pt.crew_build, pt.id, $5
       FROM project_templates pt WHERE pt.tenant_id=$2 AND pt.id=$4
       RETURNING id`,
      [project.id, project.tenantId, project.name,
        project.templateId, project.createdAt],
    );
    if (!rows[0]) throw new NotFoundError('Project template not found');
  }

  async saveProjectTemplate(db: DbClient, template: ProjectTemplate): Promise<void> {
    await db.query(
      `INSERT INTO project_templates
         (id, tenant_id, name, crew_build, aor_depth,
          aor_level_labels, discipline_groups, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [template.id, template.tenantId, template.name, template.crewBuild,
        template.aorDepth, JSON.stringify(template.aorLevelLabels),
        JSON.stringify(template.departmentNames), template.createdBy,
        template.createdAt, template.updatedAt],
    );
  }

  private mapProjectTemplate(row: {
    id: UUID; tenant_id: UUID; name: string; crew_build: ProjectTemplate['crewBuild'];
    aor_depth: number; aor_level_labels: string[]; discipline_groups: string[];
    created_by: UUID; created_at: Date; updated_at: Date;
  }): ProjectTemplate {
    return { id: row.id, tenantId: row.tenant_id, name: row.name,
      crewBuild: row.crew_build, aorDepth: row.aor_depth,
      aorLevelLabels: row.aor_level_labels,
      departmentNames: row.discipline_groups,
      createdBy: row.created_by, createdAt: row.created_at,
      updatedAt: row.updated_at };
  }

  async findProjectTemplate(
    db: DbClient, tenantId: UUID, templateId: UUID, lock = false,
  ): Promise<ProjectTemplate | null> {
    const { rows } = await db.query<Parameters<TenancyRepository['mapProjectTemplate']>[0]>(
      `SELECT id, tenant_id, name, crew_build, aor_depth,
              aor_level_labels, discipline_groups, created_by, created_at, updated_at
       FROM project_templates WHERE tenant_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,
      [tenantId, templateId],
    );
    return rows[0] ? this.mapProjectTemplate(rows[0]) : null;
  }

  async listProjectTemplates(
    db: DbClient, tenantId: UUID, limit: number, offset: number,
  ): Promise<{ templates: ProjectTemplate[]; total: number }> {
    const { rows } = await db.query<
      Parameters<TenancyRepository['mapProjectTemplate']>[0] & { total_count: string }
    >(
      `SELECT id, tenant_id, name, crew_build, aor_depth,
              aor_level_labels, discipline_groups, created_by, created_at,
              updated_at, count(*) OVER() AS total_count
       FROM project_templates WHERE tenant_id=$1
       ORDER BY name,id LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    );
    if (rows.length > 0) return { templates: rows.map((r) => this.mapProjectTemplate(r)),
      total: Number(rows[0]!.total_count) };
    const count = await db.query<{ count: string }>(
      'SELECT count(*) AS count FROM project_templates WHERE tenant_id=$1', [tenantId]);
    return { templates: [], total: Number(count.rows[0]?.count ?? 0) };
  }

  async updateProjectTemplate(db: DbClient, template: ProjectTemplate): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE project_templates SET name=$3,crew_build=$4,aor_depth=$5,
         aor_level_labels=$6,discipline_groups=$7,updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2 RETURNING id`,
      [template.tenantId, template.id, template.name, template.crewBuild,
        template.aorDepth, JSON.stringify(template.aorLevelLabels),
        JSON.stringify(template.departmentNames)],
    );
    return rows.length > 0;
  }

  async findTemplateProjectReferences(
    db: DbClient, tenantId: UUID, templateId: UUID,
  ): Promise<Array<{ id: UUID; name: string }>> {
    const { rows } = await db.query<{ id: UUID; name: string }>(
      `SELECT id,name FROM projects WHERE tenant_id=$1 AND template_id=$2
       ORDER BY name,id`,
      [tenantId, templateId],
    );
    return rows;
  }

  async deleteProjectTemplate(
    db: DbClient, tenantId: UUID, templateId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `DELETE FROM project_templates pt WHERE pt.tenant_id=$1 AND pt.id=$2
         AND NOT EXISTS (SELECT 1 FROM projects p
           WHERE p.tenant_id=pt.tenant_id AND p.template_id=pt.id)
       RETURNING id`,
      [tenantId, templateId],
    );
    return rows.length > 0;
  }

  async lockProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null> {
    const { rows } = await db.query<{ id: UUID }>(
      `SELECT id FROM projects WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
      [projectId, tenantId],
    );
    return rows[0] ? this.findProjectById(db, tenantId, projectId) : null;
  }

  async archiveProject(
    db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID,
  ): Promise<number> {
    const { rows: changed } = await db.query<{ id: UUID }>(
      `UPDATE projects SET status='ARCHIVED', archived_at=NOW(), archived_by=$3
       WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE' RETURNING id`,
      [projectId, tenantId, actorId],
    );
    if (changed.length === 0) throw new NotFoundError('Active project not found');
    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*) AS count FROM tickets
       WHERE tenant_id=$1 AND project_id=$2
         AND status NOT IN ('DRAFT','COMPLETED','REJECTED','REQUESTER_CANCELED',
           'FIELD_CANCELED','SURVEY_CANCELED')`,
      [tenantId, projectId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async findActingDesignee(
    db: DbClient, tenantId: UUID, projectId: UUID,
  ): Promise<UUID | null> {
    const { rows } = await db.query<{ user_id: UUID }>(
      `SELECT pm.user_id FROM project_memberships pm
       JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
         AND u.deactivated_at IS NULL
       WHERE pm.project_id=$2 AND pm.designated_acting_for='SURVEY_MANAGER'
         AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
       LIMIT 1`,
      [tenantId, projectId],
    );
    return rows[0]?.user_id ?? null;
  }

  async isEligibleActingDesignee(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ eligible: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM project_memberships pm
         JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
         JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
           AND u.deactivated_at IS NULL
         WHERE pm.project_id=$2 AND pm.user_id=$3
           AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
       ) AS eligible`,
      [tenantId, projectId, userId],
    );
    return rows[0]?.eligible === true;
  }

  async setActingDesignee(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID | null,
  ): Promise<void> {
    await db.query(
      `UPDATE project_memberships pm SET designated_acting_for=NULL
       FROM projects p WHERE pm.project_id=p.id AND p.id=$2 AND p.tenant_id=$1
         AND pm.designated_acting_for='SURVEY_MANAGER'`,
      [tenantId, projectId],
    );
    if (userId) {
      const { rows } = await db.query<{ id: UUID }>(
        `UPDATE project_memberships pm SET designated_acting_for='SURVEY_MANAGER'
         FROM projects p, users u
         WHERE pm.project_id=p.id AND p.id=$2 AND p.tenant_id=$1
           AND pm.user_id=$3 AND u.id=pm.user_id AND u.tenant_id=p.tenant_id
           AND u.deactivated_at IS NULL
           AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
         RETURNING pm.id`,
        [tenantId, projectId, userId],
      );
      if (rows.length === 0) throw new NotFoundError('Eligible project member not found');
    }
  }

  async findEligibleActingCandidate(
    db: DbClient, tenantId: UUID, projectId: UUID, excludedUserId: UUID,
  ): Promise<{ userId: UUID; cascadeLevel: number } | null> {
    const { rows } = await db.query<{ user_id: UUID; cascade_level: number }>(
      `SELECT pm.user_id,
         CASE WHEN pm.designated_acting_for='SURVEY_MANAGER' THEN 0
              WHEN pm.role='SURVEY_SUPERINTENDENT' THEN 1
              WHEN pm.role='PARTY_CHIEF' THEN 2 ELSE 3 END AS cascade_level
       FROM project_memberships pm
       JOIN projects p ON p.id=pm.project_id AND p.id=$2 AND p.tenant_id=$1
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
         AND u.deactivated_at IS NULL
       WHERE pm.user_id<>$3
         AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
         AND (p.crew_build='FULL' OR pm.role<>'SURVEY_SUPERINTENDENT'
           OR pm.designated_acting_for='SURVEY_MANAGER')
       ORDER BY cascade_level, pm.created_at, pm.user_id LIMIT 1`,
      [tenantId, projectId, excludedUserId],
    );
    return rows[0] ? { userId: rows[0].user_id,
      cascadeLevel: Number(rows[0].cascade_level) } : null;
  }

  async listSurveyManagerRemovalProjects(
    db: DbClient, tenantId: UUID, userId: UUID,
  ): Promise<Array<{ id: UUID; name: string; hasOtherManager: boolean;
    hasActingCoverage: boolean }>> {
    const { rows } = await db.query<{
      id: UUID; name: string; has_other_manager: boolean; has_acting_coverage: boolean;
    }>(
      `SELECT p.id, p.name,
         EXISTS (SELECT 1 FROM project_memberships other
           JOIN users ou ON ou.id=other.user_id AND ou.tenant_id=p.tenant_id
             AND ou.deactivated_at IS NULL
           WHERE other.project_id=p.id AND other.role='SURVEY_MANAGER'
             AND other.user_id<>$2) AS has_other_manager,
         (EXISTS (SELECT 1 FROM project_memberships designee
           JOIN users du ON du.id=designee.user_id AND du.tenant_id=p.tenant_id
             AND du.deactivated_at IS NULL
           WHERE designee.project_id=p.id
             AND designee.designated_acting_for='SURVEY_MANAGER'
             AND designee.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
             AND designee.user_id<>$2)
          OR EXISTS (SELECT 1 FROM acting_grants ag
           JOIN users au ON au.id=ag.user_id AND au.tenant_id=p.tenant_id
             AND au.deactivated_at IS NULL
           WHERE ag.project_id=p.id AND ag.tenant_id=p.tenant_id
             AND ag.role='SURVEY_MANAGER' AND ag.revoked_at IS NULL
             AND ag.user_id<>$2)) AS has_acting_coverage
       FROM projects p JOIN project_memberships pm ON pm.project_id=p.id
         AND pm.user_id=$2 AND pm.role='SURVEY_MANAGER'
       WHERE p.tenant_id=$1 AND p.status='ACTIVE'
       ORDER BY p.name`,
      [tenantId, userId],
    );
    return rows.map((r) => ({ id: r.id, name: r.name,
      hasOtherManager: r.has_other_manager,
      hasActingCoverage: r.has_acting_coverage }));
  }

  private mapActingGrant(row: {
    id: UUID; tenant_id: UUID; project_id: UUID; user_id: UUID;
    role: 'SURVEY_MANAGER'; scope: ActingGrant['scope']; trigger: ActingGrant['trigger'];
    cascade_level: number; granted_reason: string; confirmed_by: UUID | null;
    confirmed_at: Date | null; revoked_by: UUID | null; revoked_at: Date | null;
    created_at: Date;
  }): ActingGrant {
    return { id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
      userId: row.user_id, role: row.role, scope: row.scope,
      trigger: row.trigger, cascadeLevel: row.cascade_level,
      grantedReason: row.granted_reason, confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at, revokedBy: row.revoked_by,
      revokedAt: row.revoked_at, createdAt: row.created_at };
  }

  async listActiveActingGrants(
    db: DbClient, tenantId: UUID, projectId: UUID,
  ): Promise<ActingGrant[]> {
    const { rows } = await db.query<Parameters<TenancyRepository['mapActingGrant']>[0]>(
      `SELECT ag.* FROM acting_grants ag
       JOIN projects p ON p.id=ag.project_id AND p.tenant_id=ag.tenant_id
         AND p.status='ACTIVE'
       JOIN users u ON u.id=ag.user_id AND u.tenant_id=ag.tenant_id
         AND u.deactivated_at IS NULL
       JOIN project_memberships pm ON pm.project_id=ag.project_id
         AND pm.user_id=ag.user_id
         AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
       WHERE ag.tenant_id=$1 AND ag.project_id=$2
         AND ag.role='SURVEY_MANAGER' AND ag.revoked_at IS NULL
         AND ag.scope->>'projectId'=ag.project_id::text
         AND ag.scope->'actions' ? 'manage_workflow'
       ORDER BY ag.created_at DESC`,
      [tenantId, projectId],
    );
    return rows.map((r) => this.mapActingGrant(r));
  }

  async findActingGrant(
    db: DbClient, tenantId: UUID, projectId: UUID, grantId: UUID,
  ): Promise<ActingGrant | null> {
    const { rows } = await db.query<Parameters<TenancyRepository['mapActingGrant']>[0]>(
      `SELECT * FROM acting_grants WHERE id=$3 AND tenant_id=$1 AND project_id=$2`,
      [tenantId, projectId, grantId],
    );
    return rows[0] ? this.mapActingGrant(rows[0]) : null;
  }

  async issueActingGrant(db: DbClient, grant: ActingGrant): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO acting_grants (id, tenant_id, project_id, user_id, role,
        scope, trigger, cascade_level, granted_by, granted_reason, created_at)
       SELECT $1, p.tenant_id, p.id, u.id, $5,$6,$7,$8,'SYSTEM',$9,$10
       FROM projects p
       JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$4
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
         AND u.deactivated_at IS NULL
       WHERE p.tenant_id=$2 AND p.id=$3 AND p.status='ACTIVE'
         AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
       RETURNING id`,
      [grant.id, grant.tenantId, grant.projectId, grant.userId, grant.role,
        JSON.stringify(grant.scope), grant.trigger, grant.cascadeLevel,
        grant.grantedReason, grant.createdAt],
    );
    return rows.length > 0;
  }

  async confirmActingGrant(
    db: DbClient, tenantId: UUID, projectId: UUID, grantId: UUID, actorId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE acting_grants SET confirmed_by=$4, confirmed_at=NOW()
       WHERE tenant_id=$1 AND project_id=$2 AND id=$3
         AND revoked_at IS NULL AND confirmed_at IS NULL RETURNING id`,
      [tenantId, projectId, grantId, actorId],
    );
    return rows.length > 0;
  }

  async revokeActingGrant(
    db: DbClient, tenantId: UUID, projectId: UUID, grantId: UUID, actorId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE acting_grants SET revoked_by=$4, revoked_at=NOW()
       WHERE tenant_id=$1 AND project_id=$2 AND id=$3
         AND revoked_at IS NULL RETURNING id`,
      [tenantId, projectId, grantId, actorId],
    );
    return rows.length > 0;
  }

  async isActiveSurveyManager(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ active: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM project_memberships pm
         JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
         JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
           AND u.deactivated_at IS NULL
         WHERE pm.project_id=$2 AND pm.user_id=$3 AND pm.role='SURVEY_MANAGER') AS active`,
      [tenantId, projectId, userId],
    );
    return rows[0]?.active === true;
  }

  async getProjectReadinessFacts(
    db: DbClient, tenantId: UUID, projectId: UUID,
  ): Promise<ProjectReadinessFacts> {
    const { rows } = await db.query<{
      crew_build: ProjectReadinessFacts['crewBuild'];
      aor_levels: string; aor_nodes: string; survey_managers: string;
      superintendent_aor_assignments: string; departments: string;
      acting_survey_managers: string; allowed_domains: string;
    }>(
      `SELECT p.crew_build,
         (SELECT count(*) FROM aor_levels l WHERE l.project_id=p.id AND l.tenant_id=p.tenant_id) AS aor_levels,
         (SELECT count(*) FROM aor_nodes n WHERE n.project_id=p.id AND n.tenant_id=p.tenant_id
           AND n.retired_at IS NULL) AS aor_nodes,
         (SELECT count(*) FROM project_memberships pm JOIN users u ON u.id=pm.user_id
           AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL
           WHERE pm.project_id=p.id AND pm.role='SURVEY_MANAGER') AS survey_managers,
         (SELECT count(*) FROM aor_assignments aa
           JOIN project_memberships pm ON pm.project_id=aa.project_id AND pm.user_id=aa.user_id
           JOIN users u ON u.id=aa.user_id AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL
           JOIN aor_nodes n ON n.id=aa.aor_node_id AND n.retired_at IS NULL
           WHERE aa.project_id=p.id AND aa.tenant_id=p.tenant_id AND aa.deactivated_at IS NULL
             AND pm.role='SURVEY_SUPERINTENDENT') AS superintendent_aor_assignments,
         (SELECT count(*) FROM departments d WHERE d.project_id=p.id AND d.tenant_id=p.tenant_id) AS departments,
         (SELECT count(*) FROM project_memberships pm JOIN users u ON u.id=pm.user_id
           AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL
           WHERE pm.project_id=p.id AND pm.designated_acting_for='SURVEY_MANAGER') AS acting_survey_managers,
         (SELECT count(*) FROM allowed_domains ad WHERE ad.tenant_id=p.tenant_id
           AND ad.company_id IS NOT NULL) AS allowed_domains
       FROM projects p WHERE p.id=$1 AND p.tenant_id=$2`,
      [projectId, tenantId],
    );
    if (!rows[0]) throw new NotFoundError('Project not found');
    const r = rows[0];
    return {
      crewBuild: r.crew_build,
      aorLevels: Number(r.aor_levels), aorNodes: Number(r.aor_nodes),
      surveyManagers: Number(r.survey_managers),
      superintendentAorAssignments: Number(r.superintendent_aor_assignments),
      departments: Number(r.departments),
      actingSurveyManagers: Number(r.acting_survey_managers),
      allowedDomains: Number(r.allowed_domains),
    };
  }

  async activateProject(
    db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE projects SET status='ACTIVE', activated_at=NOW(), activated_by=$3
       WHERE id=$1 AND tenant_id=$2 AND status='SETUP' RETURNING id`,
      [projectId, tenantId, actorId],
    );
    return rows.length > 0;
  }

  async saveAorLevel(db: DbClient, level: AorLevel): Promise<void> {
    await db.query(
      `INSERT INTO aor_levels (id, project_id, tenant_id, depth, label, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [level.id, level.projectId, level.tenantId, level.depth, level.label, level.createdAt],
    );
  }

  async findAorLevel(
    db: DbClient, tenantId: UUID, projectId: UUID, levelId: UUID,
  ): Promise<AorLevel | null> {
    const { rows } = await db.query<{
      id: UUID; project_id: UUID; tenant_id: UUID; depth: number;
      label: string; created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, depth, label, created_at FROM aor_levels
       WHERE id=$1 AND project_id=$2 AND tenant_id=$3`,
      [levelId, projectId, tenantId],
    );
    const r = rows[0];
    return r ? { id: r.id, projectId: r.project_id, tenantId: r.tenant_id,
      depth: r.depth, label: r.label, createdAt: r.created_at } : null;
  }

  async saveAorNode(db: DbClient, node: AorNode): Promise<void> {
    await db.query(
      `INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, parent_id,
         name, code, retired_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [node.id, node.projectId, node.tenantId, node.levelId, node.parentId,
        node.name, node.code, node.retiredAt, node.createdAt],
    );
  }

  async findAorNodePlacement(
    db: DbClient, tenantId: UUID, projectId: UUID, nodeId: UUID,
  ): Promise<{ id: UUID; depth: number } | null> {
    const { rows } = await db.query<{ id: UUID; depth: number }>(
      `SELECT n.id, l.depth FROM aor_nodes n
       JOIN aor_levels l ON l.id=n.level_id AND l.project_id=n.project_id AND l.tenant_id=n.tenant_id
       WHERE n.id=$1 AND n.project_id=$2 AND n.tenant_id=$3 AND n.retired_at IS NULL`,
      [nodeId, projectId, tenantId],
    );
    return rows[0] ?? null;
  }

  async assignAorSuperintendent(
    db: DbClient, tenantId: UUID, projectId: UUID, nodeId: UUID, userId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO aor_assignments (project_id, tenant_id, aor_node_id, user_id)
       SELECT p.id, p.tenant_id, n.id, pm.user_id
       FROM projects p
       JOIN aor_nodes n ON n.project_id=p.id AND n.tenant_id=p.tenant_id
         AND n.id=$3 AND n.retired_at IS NULL
       JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$4
         AND pm.role='SURVEY_SUPERINTENDENT'
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL
       WHERE p.id=$2 AND p.tenant_id=$1 AND p.status<>'ARCHIVED'
       RETURNING id`,
      [tenantId, projectId, nodeId, userId],
    );
    return rows.length > 0;
  }

  async findAorNodeForOperation(
    db: DbClient, tenantId: UUID, projectId: UUID, nodeId: UUID,
  ): Promise<{ id: UUID; code: string; retiredAt: Date | null } | null> {
    const { rows } = await db.query<{
      id: UUID; code: string; retired_at: Date | null;
    }>(
      `SELECT id, code, retired_at FROM aor_nodes
       WHERE tenant_id=$1 AND project_id=$2 AND id=$3`,
      [tenantId, projectId, nodeId],
    );
    return rows[0] ? { id: rows[0].id, code: rows[0].code,
      retiredAt: rows[0].retired_at } : null;
  }

  async retireAorNode(
    db: DbClient, tenantId: UUID, projectId: UUID, nodeId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `WITH RECURSIVE descendants AS (
         SELECT id, parent_id, retired_at FROM aor_nodes
         WHERE tenant_id=$1 AND project_id=$2 AND id=$3
         UNION ALL
         SELECT child.id, child.parent_id, child.retired_at
         FROM aor_nodes child JOIN descendants d ON child.parent_id=d.id
         WHERE child.tenant_id=$1 AND child.project_id=$2
       )
       UPDATE aor_nodes n SET retired_at=NOW()
       WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.id=$3
         AND n.retired_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM descendants d
           WHERE d.id<>$3 AND d.retired_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM aor_assignments aa
           WHERE aa.tenant_id=$1 AND aa.project_id=$2
             AND aa.aor_node_id=$3 AND aa.deactivated_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM tickets t
           WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.aor_node_id=$3
             AND t.status NOT IN ('REJECTED','COMPLETED',
               'REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'))
         AND (SELECT count(*) FROM aor_nodes live
           WHERE live.tenant_id=$1 AND live.project_id=$2
             AND live.retired_at IS NULL)>1
       RETURNING n.id`,
      [tenantId, projectId, nodeId],
    );
    return rows.length > 0;
  }

  async findAorAssignment(
    db: DbClient, tenantId: UUID, projectId: UUID, assignmentId: UUID,
  ): Promise<{ id: UUID; nodeId: UUID; userId: UUID | null;
    departmentId: UUID | null; role: string | null;
    deactivatedAt: Date | null } | null> {
    const { rows } = await db.query<{
      id: UUID; aor_node_id: UUID; user_id: UUID | null;
      department_id: UUID | null; role: string | null;
      deactivated_at: Date | null;
    }>(
      `SELECT aa.id, aa.aor_node_id, aa.user_id, aa.department_id,
              pm.role, aa.deactivated_at
       FROM aor_assignments aa
       LEFT JOIN project_memberships pm ON pm.project_id=aa.project_id
         AND pm.user_id=aa.user_id
       WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.id=$3`,
      [tenantId, projectId, assignmentId],
    );
    const r = rows[0];
    return r ? { id: r.id, nodeId: r.aor_node_id,
      userId: r.user_id, departmentId: r.department_id,
      role: r.role, deactivatedAt: r.deactivated_at } : null;
  }

  async findEligibleAorUserRole(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID,
  ): Promise<string | null> {
    const { rows } = await db.query<{ role: string }>(
      `SELECT pm.role FROM project_memberships pm
       JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
         AND u.deactivated_at IS NULL
       WHERE pm.project_id=$2 AND pm.user_id=$3
         AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF',
           'AREA_VIEWER','DEPARTMENT_LEAD')`,
      [tenantId, projectId, userId],
    );
    return rows[0]?.role ?? null;
  }

  async isActiveProjectDepartment(
    db: DbClient, tenantId: UUID, projectId: UUID, departmentId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ valid: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM departments d
         WHERE d.tenant_id=$1 AND d.project_id=$2 AND d.id=$3) AS valid`,
      [tenantId, projectId, departmentId],
    );
    return rows[0]?.valid === true;
  }

  async isNodeWithinActorScope(
    db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, nodeId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ allowed: boolean }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id FROM aor_nodes
         WHERE tenant_id=$1 AND project_id=$2 AND id=$4 AND retired_at IS NULL
         UNION ALL
         SELECT parent.id, parent.parent_id FROM aor_nodes parent
         JOIN ancestors child ON child.parent_id=parent.id
         WHERE parent.tenant_id=$1 AND parent.project_id=$2
       )
       SELECT EXISTS (SELECT 1 FROM ancestors a
         JOIN aor_assignments aa ON aa.aor_node_id=a.id
           AND aa.tenant_id=$1 AND aa.project_id=$2
           AND aa.user_id=$3 AND aa.deactivated_at IS NULL) AS allowed`,
      [tenantId, projectId, actorId, nodeId],
    );
    return rows[0]?.allowed === true;
  }

  async assignAorScope(
    db: DbClient, tenantId: UUID, projectId: UUID,
    nodeId: UUID, userId: UUID | null, departmentId: UUID | null,
  ): Promise<UUID | null> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO aor_assignments
         (tenant_id,project_id,aor_node_id,user_id,department_id)
       SELECT p.tenant_id,p.id,n.id,$4,$5
       FROM projects p JOIN aor_nodes n ON n.project_id=p.id
         AND n.tenant_id=p.tenant_id AND n.id=$3 AND n.retired_at IS NULL
       WHERE p.tenant_id=$1 AND p.id=$2 AND p.status<>'ARCHIVED'
         AND NOT EXISTS (SELECT 1 FROM aor_assignments existing
           WHERE existing.tenant_id=$1 AND existing.project_id=$2
             AND existing.aor_node_id=$3 AND existing.deactivated_at IS NULL
             AND existing.user_id IS NOT DISTINCT FROM $4::uuid
             AND existing.department_id IS NOT DISTINCT FROM $5::uuid)
         AND (($4::uuid IS NOT NULL AND $5::uuid IS NULL AND EXISTS (
           SELECT 1 FROM project_memberships pm JOIN users u ON u.id=pm.user_id
             AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL
           WHERE pm.project_id=p.id AND pm.user_id=$4
             AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF',
               'AREA_VIEWER','DEPARTMENT_LEAD')))
          OR ($4::uuid IS NULL AND $5::uuid IS NOT NULL AND EXISTS (
           SELECT 1 FROM departments d WHERE d.tenant_id=p.tenant_id
             AND d.project_id=p.id AND d.id=$5)))
       RETURNING id`,
      [tenantId, projectId, nodeId, userId, departmentId],
    );
    return rows[0]?.id ?? null;
  }

  async moveAorAssignment(
    db: DbClient, tenantId: UUID, projectId: UUID,
    assignmentId: UUID, nodeId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE aor_assignments aa SET aor_node_id=n.id
       FROM aor_nodes n, projects p
       WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.id=$3
         AND aa.deactivated_at IS NULL
         AND p.id=aa.project_id AND p.tenant_id=aa.tenant_id
         AND p.status<>'ARCHIVED'
         AND n.id=$4 AND n.tenant_id=p.tenant_id
         AND n.project_id=p.id AND n.retired_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM aor_assignments existing
           WHERE existing.tenant_id=aa.tenant_id
             AND existing.project_id=aa.project_id
             AND existing.id<>aa.id AND existing.aor_node_id=n.id
             AND existing.deactivated_at IS NULL
             AND existing.user_id IS NOT DISTINCT FROM aa.user_id
             AND existing.department_id IS NOT DISTINCT FROM aa.department_id)
       RETURNING aa.id`,
      [tenantId, projectId, assignmentId, nodeId],
    );
    return rows.length > 0;
  }

  async findCrewRoster(
    db: DbClient, tenantId: UUID, projectId: UUID, instrumentManId: UUID,
  ): Promise<{ id: UUID; partyChiefId: UUID;
    deactivatedAt: Date | null } | null> {
    const { rows } = await db.query<{
      id: UUID; party_chief_id: UUID; deactivated_at: Date | null;
    }>(
      `SELECT id, party_chief_id, deactivated_at FROM crew_rosters
       WHERE tenant_id=$1 AND project_id=$2 AND instrument_man_id=$3`,
      [tenantId, projectId, instrumentManId],
    );
    const r = rows[0];
    return r ? { id: r.id, partyChiefId: r.party_chief_id,
      deactivatedAt: r.deactivated_at } : null;
  }

  async canSuperintendentManagePartyChief(
    db: DbClient, tenantId: UUID, projectId: UUID,
    superintendentId: UUID, partyChiefId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ allowed: boolean }>(
      `WITH RECURSIVE covered AS (
         SELECT n.id FROM aor_assignments aa
         JOIN aor_nodes n ON n.id=aa.aor_node_id
           AND n.tenant_id=aa.tenant_id AND n.project_id=aa.project_id
         WHERE aa.tenant_id=$1 AND aa.project_id=$2
           AND aa.user_id=$3 AND aa.deactivated_at IS NULL
         UNION
         SELECT child.id FROM aor_nodes child JOIN covered parent
           ON child.parent_id=parent.id
         WHERE child.tenant_id=$1 AND child.project_id=$2
       )
       SELECT EXISTS (SELECT 1 FROM covered c
         JOIN aor_assignments pc ON pc.aor_node_id=c.id
           AND pc.tenant_id=$1 AND pc.project_id=$2
           AND pc.user_id=$4 AND pc.deactivated_at IS NULL) AS allowed`,
      [tenantId, projectId, superintendentId, partyChiefId],
    );
    return rows[0]?.allowed === true;
  }

  async saveCrewRoster(
    db: DbClient, tenantId: UUID, projectId: UUID,
    partyChiefId: UUID, instrumentManId: UUID,
  ): Promise<UUID | null> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO crew_rosters
         (tenant_id,project_id,party_chief_id,instrument_man_id)
       SELECT p.tenant_id,p.id,pc.user_id,im.user_id
       FROM projects p
       JOIN project_memberships pc ON pc.project_id=p.id
         AND pc.user_id=$3 AND pc.role='PARTY_CHIEF'
       JOIN users pcu ON pcu.id=pc.user_id AND pcu.tenant_id=p.tenant_id
         AND pcu.deactivated_at IS NULL
       JOIN project_memberships im ON im.project_id=p.id
         AND im.user_id=$4 AND im.role='INSTRUMENT_MAN'
       JOIN users imu ON imu.id=im.user_id AND imu.tenant_id=p.tenant_id
         AND imu.deactivated_at IS NULL
       WHERE p.tenant_id=$1 AND p.id=$2 AND p.status<>'ARCHIVED'
       ON CONFLICT (project_id,instrument_man_id)
       DO UPDATE SET party_chief_id=EXCLUDED.party_chief_id,
         deactivated_at=NULL, created_at=NOW()
       RETURNING id`,
      [tenantId, projectId, partyChiefId, instrumentManId],
    );
    return rows[0]?.id ?? null;
  }

  async deactivateCrewRoster(
    db: DbClient, tenantId: UUID, projectId: UUID,
    instrumentManId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE crew_rosters SET deactivated_at=NOW()
       WHERE tenant_id=$1 AND project_id=$2 AND instrument_man_id=$3
         AND deactivated_at IS NULL RETURNING id`,
      [tenantId, projectId, instrumentManId],
    );
    return rows.length > 0;
  }

  async saveDepartment(db: DbClient, department: Department): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO departments (id, project_id, tenant_id, name, manager_title, created_by, created_at)
       SELECT $1, p.id, p.tenant_id, $4, $5, u.id, $7
       FROM projects p JOIN users u ON u.id=$6 AND u.tenant_id=p.tenant_id
         AND u.deactivated_at IS NULL
       WHERE p.id=$2 AND p.tenant_id=$3 AND p.status<>'ARCHIVED'
       ON CONFLICT (project_id, name) DO NOTHING
       RETURNING id`,
      [department.id, department.projectId, department.tenantId,
        department.name, department.managerTitle, department.createdBy,
        department.createdAt],
    );
    return rows.length > 0;
  }

  async saveDepartmentManagerTitle(db: DbClient, department: Department): Promise<void> {
    await db.query(
      `INSERT INTO department_titles
         (tenant_id, department_id, title, default_priority, assignment_layer)
       VALUES ($1, $2, $3, 'MED_HIGH', 'MANAGER')`,
      [department.tenantId, department.id, department.managerTitle],
    );
  }

  async assignDepartmentAor(
    db: DbClient, department: Department, nodeId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO aor_assignments
         (project_id, tenant_id, aor_node_id, department_id)
       SELECT d.project_id, d.tenant_id, n.id, d.id
       FROM departments d JOIN aor_nodes n ON n.project_id=d.project_id
         AND n.tenant_id=d.tenant_id AND n.id=$4 AND n.retired_at IS NULL
       WHERE d.id=$1 AND d.project_id=$2 AND d.tenant_id=$3
       RETURNING id`,
      [department.id, department.projectId, department.tenantId, nodeId],
    );
    return rows.length > 0;
  }

  async listDepartments(
    db: DbClient, tenantId: UUID, projectId: UUID,
  ): Promise<Department[]> {
    const { rows } = await db.query<{
      id: UUID; project_id: UUID; tenant_id: UUID; name: string;
      manager_title: string; created_by: UUID; created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, name, manager_title, created_by, created_at
       FROM departments WHERE project_id=$1 AND tenant_id=$2 ORDER BY name`,
      [projectId, tenantId],
    );
    return rows.map((r) => ({ id: r.id, projectId: r.project_id,
      tenantId: r.tenant_id, name: r.name, managerTitle: r.manager_title,
      createdBy: r.created_by, createdAt: r.created_at }));
  }

  async findDepartment(
    db: DbClient, tenantId: UUID, projectId: UUID, departmentId: UUID,
  ): Promise<Department | null> {
    const { rows } = await db.query<{
      id: UUID; project_id: UUID; tenant_id: UUID; name: string;
      manager_title: string; created_by: UUID; created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, name, manager_title, created_by, created_at
       FROM departments WHERE id=$1 AND project_id=$2 AND tenant_id=$3`,
      [departmentId, projectId, tenantId],
    );
    const r = rows[0];
    return r ? { id: r.id, projectId: r.project_id, tenantId: r.tenant_id,
      name: r.name, managerTitle: r.manager_title, createdBy: r.created_by,
      createdAt: r.created_at } : null;
  }

  async findDepartmentMembership(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID,
  ): Promise<DepartmentMembership | null> {
    const { rows } = await db.query<{
      id: UUID; tenant_id: UUID; project_id: UUID; department_id: UUID;
      user_id: UUID; title: string | null; assigned_by: UUID | null;
      assigned_at: Date | null; superintendent_id: UUID | null;
      deactivated_at: Date | null; created_at: Date;
    }>(
      `SELECT id, tenant_id, project_id, department_id, user_id, title,
              assigned_by, assigned_at, superintendent_id, deactivated_at, created_at
       FROM department_memberships
       WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3`,
      [tenantId, projectId, userId],
    );
    const r = rows[0];
    return r ? { id: r.id, tenantId: r.tenant_id, projectId: r.project_id,
      departmentId: r.department_id, userId: r.user_id, title: r.title,
      assignedBy: r.assigned_by, assignedAt: r.assigned_at,
      superintendentId: r.superintendent_id,
      deactivatedAt: r.deactivated_at, createdAt: r.created_at } : null;
  }

  async addDepartmentMember(
    db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, userId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO department_memberships
         (tenant_id, project_id, department_id, user_id)
       SELECT d.tenant_id, d.project_id, d.id, u.id
       FROM departments d
       JOIN projects p ON p.id=d.project_id AND p.tenant_id=d.tenant_id
         AND p.status<>'ARCHIVED'
       JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$4
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
         AND u.deactivated_at IS NULL
       WHERE d.tenant_id=$1 AND d.project_id=$2 AND d.id=$3
       ON CONFLICT (project_id, user_id) DO NOTHING
       RETURNING id`,
      [tenantId, projectId, departmentId, userId],
    );
    return rows.length > 0;
  }

  async addDepartmentTitle(db: DbClient, title: DepartmentTitle): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO department_titles
         (id, tenant_id, department_id, title, default_priority, assignment_layer, created_at)
       SELECT $1, d.tenant_id, d.id, $4, $5, $6, $7
       FROM departments d JOIN projects p ON p.id=d.project_id
         AND p.tenant_id=d.tenant_id AND p.status<>'ARCHIVED'
       WHERE d.tenant_id=$2 AND d.id=$3
       ON CONFLICT (department_id, title) DO NOTHING
       RETURNING id`,
      [title.id, title.tenantId, title.departmentId, title.title,
        title.defaultPriority, title.assignmentLayer, title.createdAt],
    );
    return rows.length > 0;
  }

  async findDepartmentTitle(
    db: DbClient, tenantId: UUID, departmentId: UUID, title: string,
  ): Promise<DepartmentTitle | null> {
    const { rows } = await db.query<{
      id: UUID; tenant_id: UUID; department_id: UUID; title: string;
      default_priority: DepartmentTitle['defaultPriority'];
      assignment_layer: DepartmentTitle['assignmentLayer']; created_at: Date;
    }>(
      `SELECT id, tenant_id, department_id, title, default_priority,
              assignment_layer, created_at FROM department_titles
       WHERE tenant_id=$1 AND department_id=$2 AND title=$3`,
      [tenantId, departmentId, title],
    );
    const r = rows[0];
    return r ? { id: r.id, tenantId: r.tenant_id,
      departmentId: r.department_id, title: r.title,
      defaultPriority: r.default_priority, assignmentLayer: r.assignment_layer,
      createdAt: r.created_at } : null;
  }

  async assignDepartmentTitle(
    db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, userId: UUID, title: string, actorId: UUID,
    superintendentId: UUID | null,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE department_memberships dm
       SET title=$5, assigned_by=$6, assigned_at=NOW(),
           superintendent_id=$7
       FROM department_titles dt, users u, project_memberships pm
       WHERE dm.tenant_id=$1 AND dm.project_id=$2 AND dm.department_id=$3
         AND dm.user_id=$4 AND dm.title IS NULL AND dm.deactivated_at IS NULL
         AND (dm.superintendent_id IS NULL OR dm.superintendent_id=$7)
         AND dt.department_id=dm.department_id AND dt.tenant_id=dm.tenant_id
         AND dt.title=$5
         AND u.id=dm.user_id AND u.tenant_id=dm.tenant_id AND u.deactivated_at IS NULL
         AND pm.project_id=dm.project_id AND pm.user_id=dm.user_id
       RETURNING dm.id`,
      [tenantId, projectId, departmentId, userId, title, actorId,
        superintendentId],
    );
    return rows.length > 0;
  }

  async countActiveDepartmentManagers(
    db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, managerTitle: string,
  ): Promise<number> {
    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*) AS count FROM department_memberships dm
       JOIN users u ON u.id=dm.user_id AND u.tenant_id=dm.tenant_id
         AND u.deactivated_at IS NULL
       WHERE dm.tenant_id=$1 AND dm.project_id=$2
         AND dm.department_id=$3 AND dm.title=$4
         AND dm.deactivated_at IS NULL`,
      [tenantId, projectId, departmentId, managerTitle],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async reassignDepartmentTitle(
    db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, userId: UUID, oldTitle: string, newTitle: string,
    actorId: UUID, superintendentId: UUID | null,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE department_memberships dm
       SET title=$6,assigned_by=$7,assigned_at=NOW(),superintendent_id=$8
       FROM department_titles dt, users u, projects p
       WHERE dm.tenant_id=$1 AND dm.project_id=$2
         AND dm.department_id=$3 AND dm.user_id=$4
         AND dm.title=$5 AND dm.deactivated_at IS NULL
         AND dt.tenant_id=dm.tenant_id AND dt.department_id=dm.department_id
         AND dt.title=$6
         AND u.id=dm.user_id AND u.tenant_id=dm.tenant_id
         AND u.deactivated_at IS NULL
         AND p.id=dm.project_id AND p.tenant_id=dm.tenant_id
         AND p.status<>'ARCHIVED'
       RETURNING dm.id`,
      [tenantId, projectId, departmentId, userId,
        oldTitle, newTitle, actorId, superintendentId],
    );
    return rows.length > 0;
  }

  async removeDepartmentMember(
    db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, userId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `DELETE FROM department_memberships dm
       USING projects p
       WHERE dm.tenant_id=$1 AND dm.project_id=$2
         AND dm.department_id=$3 AND dm.user_id=$4
         AND p.id=dm.project_id AND p.tenant_id=dm.tenant_id
         AND p.status<>'ARCHIVED'
       RETURNING dm.id`,
      [tenantId, projectId, departmentId, userId],
    );
    return rows.length > 0;
  }

  async updateDepartmentTitleCatalog(
    db: DbClient, tenantId: UUID, departmentId: UUID,
    oldTitle: string, newTitle: string,
    defaultPriority: DepartmentTitle['defaultPriority'],
    assignmentLayer: DepartmentTitle['assignmentLayer'],
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE department_titles dt
       SET title=$4,default_priority=$5,assignment_layer=$6
       FROM departments d, projects p
       WHERE dt.tenant_id=$1 AND dt.department_id=$2 AND dt.title=$3
         AND d.id=dt.department_id AND d.tenant_id=dt.tenant_id
         AND p.id=d.project_id AND p.tenant_id=d.tenant_id
         AND p.status<>'ARCHIVED'
       RETURNING dt.id`,
      [tenantId, departmentId, oldTitle, newTitle,
        defaultPriority, assignmentLayer],
    );
    return rows.length > 0;
  }

  async renameDepartmentMemberTitles(
    db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, oldTitle: string, newTitle: string,
  ): Promise<void> {
    await db.query(
      `UPDATE department_memberships SET title=$5
       WHERE tenant_id=$1 AND project_id=$2 AND department_id=$3
         AND title=$4 AND deactivated_at IS NULL`,
      [tenantId, projectId, departmentId, oldTitle, newTitle],
    );
  }

  async renameDepartmentManagerTitle(
    db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, oldTitle: string, newTitle: string,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE departments SET manager_title=$5
       WHERE tenant_id=$1 AND project_id=$2 AND id=$3
         AND manager_title=$4 RETURNING id`,
      [tenantId, projectId, departmentId, oldTitle, newTitle],
    );
    return rows.length > 0;
  }

  async saveMembership(
    db: DbClient,
    membership: { id: UUID; tenantId: UUID; projectId: UUID;
      userId: UUID; role: string; createdAt: Date },
  ): Promise<void> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO project_memberships (id, project_id, user_id, role, created_at)
       SELECT $1, p.id, u.id, $4, $5
       FROM projects p JOIN users u ON u.id = $3 AND u.tenant_id = p.tenant_id
         AND u.deactivated_at IS NULL
       WHERE p.id = $2 AND p.tenant_id=$6 AND p.status<>'ARCHIVED'
       ON CONFLICT (project_id, user_id) DO NOTHING
       RETURNING id`,
      [membership.id, membership.projectId, membership.userId,
        membership.role, membership.createdAt, membership.tenantId],
    );
    if (!rows[0]) {
      const existing = await db.query<{ id: UUID }>(
        `SELECT pm.id FROM project_memberships pm
         JOIN projects p ON p.id=pm.project_id
         WHERE pm.project_id=$1 AND pm.user_id=$2
           AND p.tenant_id=$3
           AND p.status<>'ARCHIVED'`,
        [membership.projectId, membership.userId, membership.tenantId],
      );
      if (existing.rows[0]) throw new ConflictError('User is already a project member');
      throw new NotFoundError('Active project or user not found in the same tenant');
    }
  }

  async saveWhitelistEntry(db: DbClient, entry: PriorityWhitelistEntry): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `INSERT INTO priority_whitelist (id, tenant_id, project_id, email, added_by, created_at)
       SELECT $1, p.tenant_id, p.id, $4, $5, $6
       FROM projects p WHERE p.id = $3 AND p.tenant_id = $2
       ON CONFLICT (tenant_id, project_id, email) DO NOTHING
       RETURNING id`,
      [entry.id, entry.tenantId, entry.projectId, entry.email, entry.addedBy, entry.createdAt],
    );
    return rows.length > 0;
  }

  async deleteWhitelistEntry(
    db: DbClient, tenantId: UUID, projectId: UUID, email: string,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `DELETE FROM priority_whitelist
       WHERE tenant_id = $1 AND project_id = $2 AND email = $3 RETURNING id`,
      [tenantId, projectId, email],
    );
    return rows.length > 0;
  }

  async isEmailWhitelisted(
    db: DbClient, tenantId: UUID, projectId: UUID, email: string,
  ): Promise<boolean> {
    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM priority_whitelist
         WHERE tenant_id = $1 AND project_id = $2 AND email = $3
       ) AS exists`,
      [tenantId, projectId, email.toLowerCase()],
    );
    return rows[0]?.exists === true;
  }
}
