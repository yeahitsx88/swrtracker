/**
 * Repository ports for the Tenancy module.
 * Implemented by infrastructure/tenancy.repository.ts.
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

export interface ProjectActivationReadinessSnapshot {
  aorLevelsCount: number;
  aorNodesCount: number;
  surveyManagerCount: number;
  superintendentAorAssignmentCount: number;
  departmentsCount: number;
  actingSurveyManagerCount: number;
  allowedDomainsCount: number;
}

export interface ProjectTemplateListItem {
  id: UUID;
  name: string;
  crewBuild: Project['crewBuild'];
  aorDepth: number;
  aorLevelCount: number;
  disciplineGroupCount: number;
  usageCount: number;
  createdAt: Date;
}

export interface ITenancyRepository {
  // Tenants
  saveTenant(db: DbClient, tenant: Tenant): Promise<void>;

  // Companies
  saveCompany(db: DbClient, company: Company): Promise<void>;

  // Projects
  saveProject(db: DbClient, project: Project): Promise<void>;
  findProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null>;
  getProjectActivationReadiness(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
  ): Promise<ProjectActivationReadinessSnapshot>;
  markProjectActive(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    activatedAt: Date,
    activatedBy: UUID,
  ): Promise<void>;
  markProjectArchived(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    archivedAt: Date,
    archivedBy: UUID,
  ): Promise<void>;
  listProjectTemplates(db: DbClient, tenantId: UUID): Promise<ProjectTemplateListItem[]>;
  findProjectTemplateById(db: DbClient, tenantId: UUID, templateId: UUID): Promise<ProjectTemplate | null>;
  saveProjectTemplate(db: DbClient, template: ProjectTemplate): Promise<void>;
  updateProjectTemplate(db: DbClient, template: ProjectTemplate): Promise<void>;
  findProjectsUsingTemplate(db: DbClient, tenantId: UUID, templateId: UUID): Promise<Array<{ id: UUID; name: string }>>;
  deleteProjectTemplate(db: DbClient, tenantId: UUID, templateId: UUID): Promise<void>;

  // Tenant memberships
  saveTenantMembership(db: DbClient, membership: TenantMembership): Promise<void>;
  deleteTenantMembership(db: DbClient, tenantId: UUID, userId: UUID): Promise<void>;

  // AOR setup
  saveAorLevel(db: DbClient, level: AorLevel): Promise<void>;
  findAorLevelById(db: DbClient, tenantId: UUID, levelId: UUID): Promise<AorLevel | null>;
  findAorLevelByDepth(db: DbClient, tenantId: UUID, projectId: UUID, depth: number): Promise<AorLevel | null>;
  saveAorNode(db: DbClient, node: AorNode): Promise<void>;
  findAorNodeById(db: DbClient, tenantId: UUID, nodeId: UUID): Promise<AorNode | null>;
  saveAorAssignment(db: DbClient, assignment: AorAssignment): Promise<void>;
  findAorAssignmentById(
    db: DbClient,
    tenantId: UUID,
    assignmentId: UUID,
  ): Promise<AorAssignment | null>;
  deactivateAorAssignment(
    db: DbClient,
    tenantId: UUID,
    assignmentId: UUID,
    deactivatedAt: Date,
  ): Promise<void>;
  findDepartmentById(
    db: DbClient,
    tenantId: UUID,
    departmentId: UUID,
  ): Promise<Department | null>;
  saveDepartment(db: DbClient, department: Department): Promise<void>;
  listDepartments(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Department[]>;
  saveDepartmentTitle(db: DbClient, title: DepartmentTitle): Promise<void>;
  upsertDepartmentTitle(db: DbClient, title: DepartmentTitle): Promise<void>;
  listDepartmentTitles(db: DbClient, tenantId: UUID, departmentId: UUID): Promise<DepartmentTitle[]>;
  findDepartmentTitleByName(
    db: DbClient,
    tenantId: UUID,
    departmentId: UUID,
    title: string,
  ): Promise<DepartmentTitle | null>;
  saveDepartmentMembership(db: DbClient, membership: DepartmentMembership): Promise<void>;
  findDepartmentMembershipByUser(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    userId: UUID,
  ): Promise<DepartmentMembership | null>;
  updateDepartmentMembership(db: DbClient, membership: DepartmentMembership): Promise<void>;

  // Legacy area setup compatibility
  saveArea(db: DbClient, area: Area): Promise<void>;
  findAreaById(db: DbClient, tenantId: UUID, areaId: UUID): Promise<Area | null>;
  saveSubarea(db: DbClient, subarea: Subarea): Promise<void>;

  // Project memberships
  saveMembership(db: DbClient, membership: {
    id: UUID;
    tenantId: UUID;
    projectId: UUID;
    userId: UUID;
    role: string;
    createdAt: Date;
  }): Promise<void>;
  bumpUserSessionVersion?(db: DbClient, tenantId: UUID, userId: UUID): Promise<void>;

  // Priority whitelist
  saveWhitelistEntry(db: DbClient, entry: PriorityWhitelistEntry): Promise<void>;
  deleteWhitelistEntry(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<void>;
  isEmailWhitelisted(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<boolean>;
}
