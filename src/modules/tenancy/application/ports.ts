/**
 * Repository ports for the Tenancy module.
 * Implemented by infrastructure/tenancy.repository.ts.
 */
import type { DbClient, UUID } from '@/shared/types';
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
import type { ProjectReadinessFacts } from '../domain/project-readiness';

export interface ITenancyRepository {
  // Tenants
  saveTenant(db: DbClient, tenant: Tenant): Promise<void>;

  // Companies
  saveCompany(db: DbClient, company: Company): Promise<void>;

  // Projects
  saveProject(db: DbClient, project: Project): Promise<void>;
  saveProjectFromTemplate(db: DbClient, project: Project): Promise<void>;
  saveProjectTemplate(db: DbClient, template: ProjectTemplate): Promise<void>;
  findProjectTemplate(db: DbClient, tenantId: UUID, templateId: UUID,
    lock?: boolean): Promise<ProjectTemplate | null>;
  listProjectTemplates(db: DbClient, tenantId: UUID,
    limit: number, offset: number): Promise<{ templates: ProjectTemplate[]; total: number }>;
  updateProjectTemplate(db: DbClient, template: ProjectTemplate): Promise<boolean>;
  findTemplateProjectReferences(db: DbClient, tenantId: UUID,
    templateId: UUID): Promise<Array<{ id: UUID; name: string }>>;
  deleteProjectTemplate(db: DbClient, tenantId: UUID, templateId: UUID): Promise<boolean>;
  findProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null>;
  lockProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null>;
  archiveProject(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID): Promise<number>;
  findActingDesignee(db: DbClient, tenantId: UUID, projectId: UUID): Promise<UUID | null>;
  findEligibleActingCandidate(db: DbClient, tenantId: UUID, projectId: UUID,
    excludedUserId: UUID): Promise<{ userId: UUID; cascadeLevel: number } | null>;
  isEligibleActingDesignee(db: DbClient, tenantId: UUID, projectId: UUID,
    userId: UUID): Promise<boolean>;
  setActingDesignee(db: DbClient, tenantId: UUID, projectId: UUID,
    userId: UUID | null): Promise<void>;
  listActiveActingGrants(db: DbClient, tenantId: UUID, projectId: UUID): Promise<ActingGrant[]>;
  findActingGrant(db: DbClient, tenantId: UUID, projectId: UUID,
    grantId: UUID): Promise<ActingGrant | null>;
  issueActingGrant(db: DbClient, grant: ActingGrant): Promise<boolean>;
  confirmActingGrant(db: DbClient, tenantId: UUID, projectId: UUID,
    grantId: UUID, actorId: UUID): Promise<boolean>;
  revokeActingGrant(db: DbClient, tenantId: UUID, projectId: UUID,
    grantId: UUID, actorId: UUID): Promise<boolean>;
  isActiveSurveyManager(db: DbClient, tenantId: UUID, projectId: UUID,
    userId: UUID): Promise<boolean>;
  listSurveyManagerRemovalProjects(db: DbClient, tenantId: UUID, userId: UUID):
    Promise<Array<{ id: UUID; name: string; hasOtherManager: boolean;
      hasActingCoverage: boolean }>>;
  getProjectReadinessFacts(db: DbClient, tenantId: UUID, projectId: UUID): Promise<ProjectReadinessFacts>;
  activateProject(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID): Promise<boolean>;

  // AOR setup
  saveAorLevel(db: DbClient, level: AorLevel): Promise<void>;
  findAorLevel(db: DbClient, tenantId: UUID, projectId: UUID, levelId: UUID): Promise<AorLevel | null>;
  saveAorNode(db: DbClient, node: AorNode): Promise<void>;
  findAorNodePlacement(db: DbClient, tenantId: UUID, projectId: UUID, nodeId: UUID):
    Promise<{ id: UUID; depth: number } | null>;
  assignAorSuperintendent(db: DbClient, tenantId: UUID, projectId: UUID,
    nodeId: UUID, userId: UUID): Promise<boolean>;
  findAorNodeForOperation(db: DbClient, tenantId: UUID, projectId: UUID,
    nodeId: UUID): Promise<{ id: UUID; code: string; retiredAt: Date | null } | null>;
  retireAorNode(db: DbClient, tenantId: UUID, projectId: UUID,
    nodeId: UUID): Promise<boolean>;
  findAorAssignment(db: DbClient, tenantId: UUID, projectId: UUID,
    assignmentId: UUID): Promise<{ id: UUID; nodeId: UUID; userId: UUID | null;
      departmentId: UUID | null; role: string | null; deactivatedAt: Date | null } | null>;
  findEligibleAorUserRole(db: DbClient, tenantId: UUID, projectId: UUID,
    userId: UUID): Promise<string | null>;
  isActiveProjectDepartment(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID): Promise<boolean>;
  isNodeWithinActorScope(db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, nodeId: UUID): Promise<boolean>;
  assignAorScope(db: DbClient, tenantId: UUID, projectId: UUID,
    nodeId: UUID, userId: UUID | null, departmentId: UUID | null): Promise<UUID | null>;
  moveAorAssignment(db: DbClient, tenantId: UUID, projectId: UUID,
    assignmentId: UUID, nodeId: UUID): Promise<boolean>;
  findCrewRoster(db: DbClient, tenantId: UUID, projectId: UUID,
    instrumentManId: UUID): Promise<{ id: UUID; partyChiefId: UUID;
      deactivatedAt: Date | null } | null>;
  canSuperintendentManagePartyChief(db: DbClient, tenantId: UUID, projectId: UUID,
    superintendentId: UUID, partyChiefId: UUID): Promise<boolean>;
  saveCrewRoster(db: DbClient, tenantId: UUID, projectId: UUID,
    partyChiefId: UUID, instrumentManId: UUID): Promise<UUID | null>;
  deactivateCrewRoster(db: DbClient, tenantId: UUID, projectId: UUID,
    instrumentManId: UUID): Promise<boolean>;

  // Department setup
  saveDepartment(db: DbClient, department: Department): Promise<boolean>;
  saveDepartmentManagerTitle(db: DbClient, department: Department): Promise<void>;
  assignDepartmentAor(db: DbClient, department: Department, nodeId: UUID): Promise<boolean>;
  listDepartments(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Department[]>;
  findDepartment(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID): Promise<Department | null>;
  findDepartmentMembership(db: DbClient, tenantId: UUID, projectId: UUID,
    userId: UUID): Promise<DepartmentMembership | null>;
  addDepartmentMember(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, userId: UUID): Promise<boolean>;
  addDepartmentTitle(db: DbClient, title: DepartmentTitle): Promise<boolean>;
  findDepartmentTitle(db: DbClient, tenantId: UUID, departmentId: UUID,
    title: string): Promise<DepartmentTitle | null>;
  assignDepartmentTitle(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, userId: UUID, title: string, actorId: UUID,
    superintendentId: UUID | null): Promise<boolean>;
  countActiveDepartmentManagers(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, managerTitle: string): Promise<number>;
  reassignDepartmentTitle(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, userId: UUID, oldTitle: string, newTitle: string,
    actorId: UUID, superintendentId: UUID | null): Promise<boolean>;
  removeDepartmentMember(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, userId: UUID): Promise<boolean>;
  updateDepartmentTitleCatalog(db: DbClient, tenantId: UUID,
    departmentId: UUID, oldTitle: string, newTitle: string,
    defaultPriority: DepartmentTitle['defaultPriority'],
    assignmentLayer: DepartmentTitle['assignmentLayer']): Promise<boolean>;
  renameDepartmentMemberTitles(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, oldTitle: string, newTitle: string): Promise<void>;
  renameDepartmentManagerTitle(db: DbClient, tenantId: UUID, projectId: UUID,
    departmentId: UUID, oldTitle: string, newTitle: string): Promise<boolean>;

  // Project memberships
  saveMembership(db: DbClient, membership: {
    id: UUID;
    tenantId: UUID;
    projectId: UUID;
    userId: UUID;
    role: string;
    createdAt: Date;
  }): Promise<void>;

  // Priority whitelist
  saveWhitelistEntry(db: DbClient, entry: PriorityWhitelistEntry): Promise<boolean>;
  deleteWhitelistEntry(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<boolean>;
  isEmailWhitelisted(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<boolean>;

  // Company-bound self-registration domains
  assignCompanyDomain(
    db: DbClient, tenantId: UUID, companyId: UUID, domain: string, actorId: UUID,
  ): Promise<boolean>;
  appendTenantEvent(
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
  ): Promise<void>;
}
