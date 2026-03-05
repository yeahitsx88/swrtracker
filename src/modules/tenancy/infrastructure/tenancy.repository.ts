/**
 * TenancyRepository — pg implementation of ITenancyRepository.
 * All queries are scoped by tenant_id where applicable.
 */
import type { DbClient, UUID } from '@/shared/types';
import type {
  Tenant,
  Project,
  ProjectTemplate,
  TenantMembership,
  Company,
  AorLevel,
  AorNode,
  AorAssignment,
  Department,
  DepartmentTitle,
  DepartmentMembership,
  Area,
  Subarea,
  PriorityWhitelistEntry,
} from '../domain/types';
import type {
  ITenancyRepository,
  ProjectActivationReadinessSnapshot,
  ProjectTemplateListItem,
} from '../application/ports';
import { ConflictError, ForbiddenError } from '@/shared/errors';

export class TenancyRepository implements ITenancyRepository {
  private async assertProjectNotArchived(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
  ): Promise<void> {
    const { rows } = await db.query<{ status: Project['status'] }>(
      `SELECT status
       FROM projects
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [tenantId, projectId],
    );

    if (rows[0]?.status === 'ARCHIVED') {
      throw new ConflictError('Archived projects are read-only');
    }
  }

  private async assertAorAssignmentProjectNotArchived(
    db: DbClient,
    tenantId: UUID,
    assignmentId: UUID,
  ): Promise<void> {
    const { rows } = await db.query<{ status: Project['status'] }>(
      `SELECT p.status
       FROM aor_assignments aa
       JOIN projects p
         ON p.id = aa.project_id
       WHERE aa.tenant_id = $1
         AND aa.id = $2
       LIMIT 1`,
      [tenantId, assignmentId],
    );

    if (rows[0]?.status === 'ARCHIVED') {
      throw new ConflictError('Archived projects are read-only');
    }
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
      `INSERT INTO projects (
         id, tenant_id, name, status, crew_build, template_id, created_at,
         activated_at, activated_by, archived_at, archived_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        project.id,
        project.tenantId,
        project.name,
        project.status,
        project.crewBuild,
        project.templateId,
        project.createdAt,
        project.activatedAt ?? null,
        project.activatedBy ?? null,
        project.archivedAt ?? null,
        project.archivedBy ?? null,
      ],
    );
  }

  async findProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null> {
    const { rows } = await db.query<{
      id: string;
      tenant_id: string;
      name: string;
      status: string;
      crew_build: Project['crewBuild'];
      template_id: string | null;
      created_at: Date;
      activated_at: Date | null;
      activated_by: string | null;
      archived_at: Date | null;
      archived_by: string | null;
    }>(
      `SELECT id, tenant_id, name, status, crew_build, template_id, created_at,
              activated_at, activated_by, archived_at, archived_by
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
      status:    r.status as Project['status'],
      crewBuild: r.crew_build,
      templateId: r.template_id as UUID | null,
      createdAt: r.created_at,
      activatedAt: r.activated_at,
      activatedBy: r.activated_by as UUID | null,
      archivedAt: r.archived_at,
      archivedBy: r.archived_by as UUID | null,
    };
  }

  async getProjectActivationReadiness(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
  ): Promise<ProjectActivationReadinessSnapshot> {
    const { rows } = await db.query<{
      aor_levels_count: number;
      aor_nodes_count: number;
      survey_manager_count: number;
      superintendent_aor_assignment_count: number;
      departments_count: number;
      acting_survey_manager_count: number;
      allowed_domains_count: number;
    }>(
      `SELECT
         (
           SELECT COUNT(*)::int
           FROM aor_levels
           WHERE tenant_id = $1
             AND project_id = $2
         ) AS aor_levels_count,
         (
           SELECT COUNT(*)::int
           FROM aor_nodes
           WHERE tenant_id = $1
             AND project_id = $2
             AND retired_at IS NULL
         ) AS aor_nodes_count,
         (
           SELECT COUNT(*)::int
           FROM project_memberships pm
           JOIN projects p
             ON p.id = pm.project_id
           WHERE p.tenant_id = $1
             AND pm.project_id = $2
             AND pm.role = 'SURVEY_MANAGER'
         ) AS survey_manager_count,
         (
           SELECT COUNT(*)::int
           FROM aor_assignments aa
           JOIN project_memberships pm
             ON pm.project_id = aa.project_id
            AND pm.user_id = aa.user_id
           JOIN projects p
             ON p.id = aa.project_id
           WHERE p.tenant_id = $1
             AND aa.project_id = $2
             AND aa.deactivated_at IS NULL
             AND pm.role = 'SURVEY_SUPERINTENDENT'
         ) AS superintendent_aor_assignment_count,
         (
           SELECT COUNT(*)::int
           FROM departments
           WHERE tenant_id = $1
             AND project_id = $2
         ) AS departments_count,
         (
           SELECT COUNT(*)::int
           FROM project_memberships pm
           JOIN projects p
             ON p.id = pm.project_id
           WHERE p.tenant_id = $1
             AND pm.project_id = $2
             AND pm.designated_acting_for = 'SURVEY_MANAGER'
         ) AS acting_survey_manager_count,
         (
           SELECT COUNT(*)::int
           FROM allowed_domains
           WHERE tenant_id = $1
         ) AS allowed_domains_count`,
      [tenantId, projectId],
    );

    const row = rows[0];
    return {
      aorLevelsCount: row?.aor_levels_count ?? 0,
      aorNodesCount: row?.aor_nodes_count ?? 0,
      surveyManagerCount: row?.survey_manager_count ?? 0,
      superintendentAorAssignmentCount: row?.superintendent_aor_assignment_count ?? 0,
      departmentsCount: row?.departments_count ?? 0,
      actingSurveyManagerCount: row?.acting_survey_manager_count ?? 0,
      allowedDomainsCount: row?.allowed_domains_count ?? 0,
    };
  }

  async markProjectActive(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    activatedAt: Date,
    activatedBy: UUID,
  ): Promise<void> {
    await db.query(
      `UPDATE projects
       SET status = 'ACTIVE',
           activated_at = $3,
           activated_by = $4
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'SETUP'`,
      [tenantId, projectId, activatedAt, activatedBy],
    );
  }

  async markProjectArchived(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    archivedAt: Date,
    archivedBy: UUID,
  ): Promise<void> {
    await db.query(
      `UPDATE projects
       SET status = 'ARCHIVED',
           archived_at = $3,
           archived_by = $4
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'ACTIVE'`,
      [tenantId, projectId, archivedAt, archivedBy],
    );
  }

  async findProjectTemplateById(
    db: DbClient,
    tenantId: UUID,
    templateId: UUID,
  ): Promise<ProjectTemplate | null> {
    const { rows } = await db.query<{
      id: string;
      tenant_id: string;
      name: string;
      crew_build: ProjectTemplate['crewBuild'];
      aor_depth: number;
      aor_level_labels: string[];
      discipline_groups: string[];
      created_by: string | null;
      created_at: Date;
    }>(
      `SELECT id, tenant_id, name, crew_build, aor_depth, aor_level_labels, discipline_groups, created_by, created_at
       FROM project_templates
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [templateId, tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id as UUID,
      tenantId: r.tenant_id as UUID,
      name: r.name,
      crewBuild: r.crew_build,
      aorDepth: r.aor_depth,
      aorLevelLabels: r.aor_level_labels,
      disciplineGroups: r.discipline_groups,
      createdBy: r.created_by as UUID | null,
      createdAt: r.created_at,
    };
  }

  async listProjectTemplates(db: DbClient, tenantId: UUID): Promise<ProjectTemplateListItem[]> {
    const { rows } = await db.query<{
      id: string;
      name: string;
      crew_build: Project['crewBuild'];
      aor_depth: number;
      aor_level_count: number;
      discipline_group_count: number;
      usage_count: number;
      created_at: Date;
    }>(
      `SELECT
         pt.id,
         pt.name,
         pt.crew_build,
         pt.aor_depth,
         COALESCE(jsonb_array_length(pt.aor_level_labels), 0) AS aor_level_count,
         COALESCE(jsonb_array_length(pt.discipline_groups), 0) AS discipline_group_count,
         COUNT(p.id)::int AS usage_count,
         pt.created_at
       FROM project_templates pt
       LEFT JOIN projects p
         ON p.template_id = pt.id
        AND p.tenant_id = pt.tenant_id
       WHERE pt.tenant_id = $1
       GROUP BY pt.id, pt.name, pt.crew_build, pt.aor_depth, pt.aor_level_labels, pt.discipline_groups, pt.created_at
       ORDER BY pt.created_at DESC, pt.name ASC`,
      [tenantId],
    );

    return rows.map((row) => ({
      id: row.id as UUID,
      name: row.name,
      crewBuild: row.crew_build,
      aorDepth: row.aor_depth,
      aorLevelCount: row.aor_level_count,
      disciplineGroupCount: row.discipline_group_count,
      usageCount: row.usage_count,
      createdAt: row.created_at,
    }));
  }

  async saveProjectTemplate(db: DbClient, template: ProjectTemplate): Promise<void> {
    await db.query(
      `INSERT INTO project_templates (
        id, tenant_id, name, crew_build, aor_depth, aor_level_labels, discipline_groups, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        template.id,
        template.tenantId,
        template.name,
        template.crewBuild,
        template.aorDepth,
        JSON.stringify(template.aorLevelLabels),
        JSON.stringify(template.disciplineGroups),
        template.createdBy,
        template.createdAt,
      ],
    );
  }

  async updateProjectTemplate(db: DbClient, template: ProjectTemplate): Promise<void> {
    await db.query(
      `UPDATE project_templates
       SET name = $3,
           crew_build = $4,
           aor_depth = $5,
           aor_level_labels = $6::jsonb,
           discipline_groups = $7::jsonb
       WHERE tenant_id = $1 AND id = $2`,
      [
        template.tenantId,
        template.id,
        template.name,
        template.crewBuild,
        template.aorDepth,
        JSON.stringify(template.aorLevelLabels),
        JSON.stringify(template.disciplineGroups),
      ],
    );
  }

  async findProjectsUsingTemplate(
    db: DbClient,
    tenantId: UUID,
    templateId: UUID,
  ): Promise<Array<{ id: UUID; name: string }>> {
    const { rows } = await db.query<{ id: string; name: string }>(
      `SELECT id, name
       FROM projects
       WHERE tenant_id = $1
         AND template_id = $2
       ORDER BY name ASC`,
      [tenantId, templateId],
    );
    return rows.map((row) => ({ id: row.id as UUID, name: row.name }));
  }

  async deleteProjectTemplate(db: DbClient, tenantId: UUID, templateId: UUID): Promise<void> {
    await db.query(
      `DELETE FROM project_templates
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, templateId],
    );
  }

  async saveTenantMembership(db: DbClient, membership: TenantMembership): Promise<void> {
    const { rows: userRows } = await db.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [membership.userId],
    );
    if (userRows[0]?.tenant_id !== membership.tenantId) {
      throw new ForbiddenError(
        'Tenant membership mutation violates tenant boundary',
        'SEC_TENANT_BOUNDARY_VIOLATION',
      );
    }

    await db.query(
      `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [
        membership.id,
        membership.tenantId,
        membership.userId,
        membership.role,
        membership.createdAt,
      ],
    );
  }

  async deleteTenantMembership(db: DbClient, tenantId: UUID, userId: UUID): Promise<void> {
    const { rows: userRows } = await db.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );
    if (userRows[0]?.tenant_id !== tenantId) {
      throw new ForbiddenError(
        'Tenant membership mutation violates tenant boundary',
        'SEC_TENANT_BOUNDARY_VIOLATION',
      );
    }

    await db.query(
      `DELETE FROM tenant_memberships
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
  }

  async saveAorLevel(db: DbClient, level: AorLevel): Promise<void> {
    await this.assertProjectNotArchived(db, level.tenantId, level.projectId);
    await db.query(
      `INSERT INTO aor_levels (id, project_id, tenant_id, depth, label, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [level.id, level.projectId, level.tenantId, level.depth, level.label, level.createdAt],
    );
  }

  async findAorLevelById(db: DbClient, tenantId: UUID, levelId: UUID): Promise<AorLevel | null> {
    const { rows } = await db.query<{
      id: string; project_id: string; tenant_id: string; depth: number; label: string; created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, depth, label, created_at
       FROM aor_levels
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [levelId, tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id:        r.id as UUID,
      projectId: r.project_id as UUID,
      tenantId:  r.tenant_id as UUID,
      depth:     r.depth,
      label:     r.label,
      createdAt: r.created_at,
    };
  }

  async findAorLevelByDepth(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    depth: number,
  ): Promise<AorLevel | null> {
    const { rows } = await db.query<{
      id: string; project_id: string; tenant_id: string; depth: number; label: string; created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, depth, label, created_at
       FROM aor_levels
       WHERE tenant_id = $1 AND project_id = $2 AND depth = $3
       LIMIT 1`,
      [tenantId, projectId, depth],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id:        r.id as UUID,
      projectId: r.project_id as UUID,
      tenantId:  r.tenant_id as UUID,
      depth:     r.depth,
      label:     r.label,
      createdAt: r.created_at,
    };
  }

  async saveAorNode(db: DbClient, node: AorNode): Promise<void> {
    await this.assertProjectNotArchived(db, node.tenantId, node.projectId);
    await db.query(
      `INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, parent_id, name, code, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        node.id,
        node.projectId,
        node.tenantId,
        node.levelId,
        node.parentId,
        node.name,
        node.code,
        node.createdAt,
      ],
    );
  }

  async findAorNodeById(db: DbClient, tenantId: UUID, nodeId: UUID): Promise<AorNode | null> {
    const { rows } = await db.query<{
      id: string;
      project_id: string;
      tenant_id: string;
      level_id: string;
      parent_id: string | null;
      name: string;
      code: string;
      created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, level_id, parent_id, name, code, created_at
       FROM aor_nodes
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [nodeId, tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id:        r.id as UUID,
      projectId: r.project_id as UUID,
      tenantId:  r.tenant_id as UUID,
      levelId:   r.level_id as UUID,
      parentId:  r.parent_id as UUID | null,
      name:      r.name,
      code:      r.code,
      createdAt: r.created_at,
    };
  }

  async saveAorAssignment(db: DbClient, assignment: AorAssignment): Promise<void> {
    await this.assertProjectNotArchived(db, assignment.tenantId, assignment.projectId);
    await db.query(
      `INSERT INTO aor_assignments (
         id, project_id, tenant_id, user_id, aor_node_id, department_id, deactivated_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        assignment.id,
        assignment.projectId,
        assignment.tenantId,
        assignment.userId,
        assignment.aorNodeId,
        assignment.departmentId,
        assignment.deactivatedAt,
        assignment.createdAt,
      ],
    );
  }

  async findAorAssignmentById(
    db: DbClient,
    tenantId: UUID,
    assignmentId: UUID,
  ): Promise<AorAssignment | null> {
    const { rows } = await db.query<{
      id: string;
      project_id: string;
      tenant_id: string;
      user_id: string | null;
      aor_node_id: string;
      department_id: string | null;
      deactivated_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, user_id, aor_node_id, department_id, deactivated_at, created_at
       FROM aor_assignments
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [assignmentId, tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id as UUID,
      projectId: r.project_id as UUID,
      tenantId: r.tenant_id as UUID,
      userId: r.user_id as UUID | null,
      aorNodeId: r.aor_node_id as UUID,
      departmentId: r.department_id as UUID | null,
      deactivatedAt: r.deactivated_at,
      createdAt: r.created_at,
    };
  }

  async deactivateAorAssignment(
    db: DbClient,
    tenantId: UUID,
    assignmentId: UUID,
    deactivatedAt: Date,
  ): Promise<void> {
    await this.assertAorAssignmentProjectNotArchived(db, tenantId, assignmentId);
    await db.query(
      `UPDATE aor_assignments
       SET deactivated_at = $3
       WHERE tenant_id = $1
         AND id = $2
         AND deactivated_at IS NULL`,
      [tenantId, assignmentId, deactivatedAt],
    );
  }

  async findDepartmentById(
    db: DbClient,
    tenantId: UUID,
    departmentId: UUID,
  ): Promise<Department | null> {
    const { rows } = await db.query<{
      id: string;
      project_id: string;
      tenant_id: string;
      name: string;
      manager_title: string;
      created_by: string;
      created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, name, manager_title, created_by, created_at
       FROM departments
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [departmentId, tenantId],
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id as UUID,
      projectId: rows[0].project_id as UUID,
      tenantId: rows[0].tenant_id as UUID,
      name: rows[0].name,
      managerTitle: rows[0].manager_title,
      createdBy: rows[0].created_by as UUID,
      createdAt: rows[0].created_at,
    };
  }

  async saveDepartment(db: DbClient, department: Department): Promise<void> {
    await this.assertProjectNotArchived(db, department.tenantId, department.projectId);
    await db.query(
      `INSERT INTO departments (id, project_id, tenant_id, name, manager_title, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        department.id,
        department.projectId,
        department.tenantId,
        department.name,
        department.managerTitle,
        department.createdBy,
        department.createdAt,
      ],
    );
  }

  async listDepartments(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Department[]> {
    const { rows } = await db.query<{
      id: string;
      project_id: string;
      tenant_id: string;
      name: string;
      manager_title: string;
      created_by: string;
      created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, name, manager_title, created_by, created_at
       FROM departments
       WHERE tenant_id = $1
         AND project_id = $2
       ORDER BY name ASC`,
      [tenantId, projectId],
    );
    return rows.map((row) => ({
      id: row.id as UUID,
      projectId: row.project_id as UUID,
      tenantId: row.tenant_id as UUID,
      name: row.name,
      managerTitle: row.manager_title,
      createdBy: row.created_by as UUID,
      createdAt: row.created_at,
    }));
  }

  async saveDepartmentTitle(db: DbClient, title: DepartmentTitle): Promise<void> {
    const department = await this.findDepartmentById(db, title.tenantId, title.departmentId);
    if (department) {
      await this.assertProjectNotArchived(db, title.tenantId, department.projectId);
    }
    await db.query(
      `INSERT INTO department_titles (
         id, tenant_id, department_id, title, default_priority, assignment_layer, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        title.id,
        title.tenantId,
        title.departmentId,
        title.title,
        title.defaultPriority,
        title.assignmentLayer,
        title.createdAt,
      ],
    );
  }

  async upsertDepartmentTitle(db: DbClient, title: DepartmentTitle): Promise<void> {
    const department = await this.findDepartmentById(db, title.tenantId, title.departmentId);
    if (department) {
      await this.assertProjectNotArchived(db, title.tenantId, department.projectId);
    }
    await db.query(
      `INSERT INTO department_titles (
         id, tenant_id, department_id, title, default_priority, assignment_layer, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (department_id, title) DO UPDATE
       SET default_priority = EXCLUDED.default_priority,
           assignment_layer = EXCLUDED.assignment_layer`,
      [
        title.id,
        title.tenantId,
        title.departmentId,
        title.title,
        title.defaultPriority,
        title.assignmentLayer,
        title.createdAt,
      ],
    );
  }

  async listDepartmentTitles(
    db: DbClient,
    tenantId: UUID,
    departmentId: UUID,
  ): Promise<DepartmentTitle[]> {
    const { rows } = await db.query<{
      id: string;
      tenant_id: string;
      department_id: string;
      title: string;
      default_priority: DepartmentTitle['defaultPriority'];
      assignment_layer: DepartmentTitle['assignmentLayer'];
      created_at: Date;
    }>(
      `SELECT id, tenant_id, department_id, title, default_priority, assignment_layer, created_at
       FROM department_titles
       WHERE tenant_id = $1
         AND department_id = $2
       ORDER BY title ASC`,
      [tenantId, departmentId],
    );
    return rows.map((row) => ({
      id: row.id as UUID,
      tenantId: row.tenant_id as UUID,
      departmentId: row.department_id as UUID,
      title: row.title,
      defaultPriority: row.default_priority,
      assignmentLayer: row.assignment_layer,
      createdAt: row.created_at,
    }));
  }

  async findDepartmentTitleByName(
    db: DbClient,
    tenantId: UUID,
    departmentId: UUID,
    title: string,
  ): Promise<DepartmentTitle | null> {
    const { rows } = await db.query<{
      id: string;
      tenant_id: string;
      department_id: string;
      title: string;
      default_priority: DepartmentTitle['defaultPriority'];
      assignment_layer: DepartmentTitle['assignmentLayer'];
      created_at: Date;
    }>(
      `SELECT id, tenant_id, department_id, title, default_priority, assignment_layer, created_at
       FROM department_titles
       WHERE tenant_id = $1
         AND department_id = $2
         AND title = $3
       LIMIT 1`,
      [tenantId, departmentId, title],
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id as UUID,
      tenantId: rows[0].tenant_id as UUID,
      departmentId: rows[0].department_id as UUID,
      title: rows[0].title,
      defaultPriority: rows[0].default_priority,
      assignmentLayer: rows[0].assignment_layer,
      createdAt: rows[0].created_at,
    };
  }

  async saveDepartmentMembership(db: DbClient, membership: DepartmentMembership): Promise<void> {
    await this.assertProjectNotArchived(db, membership.tenantId, membership.projectId);
    await db.query(
      `INSERT INTO department_memberships (
         id, project_id, tenant_id, user_id, department_id, title, assigned_by,
         assigned_at, superintendent_id, deactivated_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        membership.id,
        membership.projectId,
        membership.tenantId,
        membership.userId,
        membership.departmentId,
        membership.title,
        membership.assignedBy,
        membership.assignedAt,
        membership.superintendentId,
        membership.deactivatedAt,
        membership.createdAt,
      ],
    );
  }

  async findDepartmentMembershipByUser(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    userId: UUID,
  ): Promise<DepartmentMembership | null> {
    const { rows } = await db.query<{
      id: string;
      project_id: string;
      tenant_id: string;
      user_id: string;
      department_id: string;
      title: string | null;
      assigned_by: string | null;
      assigned_at: Date | null;
      superintendent_id: string | null;
      deactivated_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, user_id, department_id, title, assigned_by,
              assigned_at, superintendent_id, deactivated_at, created_at
       FROM department_memberships
       WHERE tenant_id = $1
         AND project_id = $2
         AND user_id = $3
       LIMIT 1`,
      [tenantId, projectId, userId],
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id as UUID,
      projectId: rows[0].project_id as UUID,
      tenantId: rows[0].tenant_id as UUID,
      userId: rows[0].user_id as UUID,
      departmentId: rows[0].department_id as UUID,
      title: rows[0].title,
      assignedBy: rows[0].assigned_by as UUID | null,
      assignedAt: rows[0].assigned_at,
      superintendentId: rows[0].superintendent_id as UUID | null,
      deactivatedAt: rows[0].deactivated_at,
      createdAt: rows[0].created_at,
    };
  }

  async updateDepartmentMembership(db: DbClient, membership: DepartmentMembership): Promise<void> {
    await this.assertProjectNotArchived(db, membership.tenantId, membership.projectId);
    await db.query(
      `UPDATE department_memberships
       SET department_id = $5,
           title = $6,
           assigned_by = $7,
           assigned_at = $8,
           superintendent_id = $9,
           deactivated_at = $10
       WHERE tenant_id = $1
         AND project_id = $2
         AND user_id = $3
         AND id = $4`,
      [
        membership.tenantId,
        membership.projectId,
        membership.userId,
        membership.id,
        membership.departmentId,
        membership.title,
        membership.assignedBy,
        membership.assignedAt,
        membership.superintendentId,
        membership.deactivatedAt,
      ],
    );
  }

  async saveArea(db: DbClient, area: Area): Promise<void> {
    void db;
    void area;
    throw new ConflictError('Legacy area setup writes are retired; use the AOR setup surface');
  }

  async findAreaById(db: DbClient, tenantId: UUID, areaId: UUID): Promise<Area | null> {
    const { rows } = await db.query<{
      id: string; project_id: string; tenant_id: string; name: string; code: string; created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, name, code, created_at
       FROM areas
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [areaId, tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id:        r.id as UUID,
      projectId: r.project_id as UUID,
      tenantId:  r.tenant_id as UUID,
      name:      r.name,
      code:      r.code,
      createdAt: r.created_at,
    };
  }

  async saveSubarea(db: DbClient, subarea: Subarea): Promise<void> {
    void db;
    void subarea;
    throw new ConflictError('Legacy subarea setup writes are retired; use the AOR setup surface');
  }

  async saveMembership(
    db: DbClient,
    membership: { id: UUID; tenantId: UUID; projectId: UUID; userId: UUID; role: string; createdAt: Date },
  ): Promise<void> {
    const { rows: projectRows } = await db.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [membership.projectId],
    );
    const { rows: userRows } = await db.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [membership.userId],
    );

    const projectTenantId = projectRows[0]?.tenant_id as UUID | undefined;
    const userTenantId = userRows[0]?.tenant_id as UUID | undefined;

    if (
      !projectTenantId ||
      !userTenantId ||
      projectTenantId !== membership.tenantId ||
      userTenantId !== membership.tenantId
    ) {
      throw new ForbiddenError(
        'Project membership mutation violates tenant boundary',
        'SEC_TENANT_BOUNDARY_VIOLATION',
      );
    }

    await this.assertProjectNotArchived(db, membership.tenantId, membership.projectId);

    await db.query(
      `INSERT INTO project_memberships (id, project_id, user_id, role, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [membership.id, membership.projectId, membership.userId, membership.role, membership.createdAt],
    );
  }

  async bumpUserSessionVersion(db: DbClient, tenantId: UUID, userId: UUID): Promise<void> {
    await db.query(
      `UPDATE users
       SET session_version = COALESCE(session_version, 1) + 1
       WHERE tenant_id = $1
         AND id = $2`,
      [tenantId, userId],
    );
  }

  async saveWhitelistEntry(db: DbClient, entry: PriorityWhitelistEntry): Promise<void> {
    await this.assertProjectNotArchived(db, entry.tenantId, entry.projectId);
    await db.query(
      `INSERT INTO priority_whitelist (id, tenant_id, project_id, email, added_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, project_id, email) DO NOTHING`,
      [entry.id, entry.tenantId, entry.projectId, entry.email, entry.addedBy, entry.createdAt],
    );
  }

  async deleteWhitelistEntry(
    db: DbClient, tenantId: UUID, projectId: UUID, email: string,
  ): Promise<void> {
    await this.assertProjectNotArchived(db, tenantId, projectId);
    await db.query(
      `DELETE FROM priority_whitelist
       WHERE tenant_id = $1 AND project_id = $2 AND email = $3`,
      [tenantId, projectId, email],
    );
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
