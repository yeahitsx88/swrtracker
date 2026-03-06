/**
 * Tenancy domain types — tenants, projects, companies, and setup metadata.
 * No I/O. No imports from infrastructure or application layers.
 */
import type { UUID } from '@/shared/types';

export type ProjectStatus = 'SETUP' | 'ACTIVE' | 'ARCHIVED';
export type CrewBuild = 'FULL' | 'MEDIUM' | 'SLIM';
export type TicketPriority = 'HIGH' | 'MED_HIGH' | 'MEDIUM' | 'NORMAL';
export type DepartmentTitleAssignmentLayer = 'MANAGER' | 'SUPERINTENDENT';

export type CompanyType = 'GC' | 'SUBCONTRACTOR' | 'OWNER_REP';

export interface Tenant {
  id: UUID;
  name: string;
  createdAt: Date;
}

export interface Project {
  id: UUID;
  tenantId: UUID;
  name: string;
  status: ProjectStatus;
  crewBuild: CrewBuild;
  templateId: UUID | null;
  createdAt: Date;
  activatedAt?: Date | null;
  activatedBy?: UUID | null;
  archivedAt?: Date | null;
  archivedBy?: UUID | null;
}

export interface ProjectRequestConfig {
  leadTimeEnforcementEnabled: boolean;
  leadTimeDays: number;
}

export interface ProjectTemplate {
  id: UUID;
  tenantId: UUID;
  name: string;
  crewBuild: CrewBuild;
  aorDepth: number;
  aorLevelLabels: string[];
  disciplineGroups: string[];
  createdBy: UUID | null;
  createdAt: Date;
}

export interface TenantMembership {
  id: UUID;
  tenantId: UUID;
  userId: UUID;
  role: 'TENANT_ADMIN' | 'BILLING_VIEWER';
  createdAt: Date;
}

export interface Company {
  id: UUID;
  tenantId: UUID;
  name: string;
  type: CompanyType;
  createdAt: Date;
}

export interface AorLevel {
  id: UUID;
  projectId: UUID;
  tenantId: UUID;
  depth: number;
  label: string;
  createdAt: Date;
}

export interface AorNode {
  id: UUID;
  projectId: UUID;
  tenantId: UUID;
  levelId: UUID;
  parentId: UUID | null;
  name: string;
  code: string;
  createdAt: Date;
}

export interface AorAssignment {
  id: UUID;
  projectId: UUID;
  tenantId: UUID;
  userId: UUID | null;
  aorNodeId: UUID;
  departmentId: UUID | null;
  deactivatedAt: Date | null;
  createdAt: Date;
}

export interface Department {
  id: UUID;
  projectId: UUID;
  tenantId: UUID;
  name: string;
  managerTitle: string;
  createdBy: UUID;
  createdAt: Date;
}

export interface DepartmentTitle {
  id: UUID;
  tenantId: UUID;
  departmentId: UUID;
  title: string;
  defaultPriority: TicketPriority;
  assignmentLayer: DepartmentTitleAssignmentLayer;
  createdAt: Date;
}

export interface DepartmentMembership {
  id: UUID;
  projectId: UUID;
  tenantId: UUID;
  userId: UUID;
  departmentId: UUID;
  title: string | null;
  assignedBy: UUID | null;
  assignedAt: Date | null;
  superintendentId: UUID | null;
  deactivatedAt: Date | null;
  createdAt: Date;
}

// Legacy setup types retained temporarily while the API surface migrates to AOR.
export interface Area {
  id: UUID;
  projectId: UUID;
  tenantId: UUID;
  name: string;
  code: string;
  createdAt: Date;
}

export interface Subarea {
  id: UUID;
  areaId: UUID;
  projectId: UUID;
  tenantId: UUID;
  name: string;
  createdAt: Date;
}

export interface PriorityWhitelistEntry {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  email: string;
  addedBy: UUID;
  createdAt: Date;
}
