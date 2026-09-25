/**
 * Tenancy domain types — tenants, projects, companies, and AOR configuration.
 * No I/O. No imports from infrastructure or application layers.
 */
import type { UUID } from '@/shared/types';
import type { CrewBuild } from './project-readiness';

export type ProjectStatus = 'SETUP' | 'ACTIVE' | 'ARCHIVED';

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
  activatedAt: Date | null;
  activatedBy: UUID | null;
  archivedAt: Date | null;
  archivedBy: UUID | null;
  createdAt: Date;
}

export interface ProjectTemplate {
  id: UUID;
  tenantId: UUID;
  name: string;
  crewBuild: CrewBuild;
  aorDepth: number;
  aorLevelLabels: string[];
  departmentNames: string[];
  createdBy: UUID;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActingGrant {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  userId: UUID;
  role: 'SURVEY_MANAGER';
  scope: { actions: string[]; projectId: UUID };
  trigger: 'VACANCY' | 'CASCADE';
  cascadeLevel: number;
  grantedReason: string;
  confirmedBy: UUID | null;
  confirmedAt: Date | null;
  revokedBy: UUID | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface AorLevel {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  depth: number;
  label: string;
  createdAt: Date;
}

export interface AorNode {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  levelId: UUID;
  parentId: UUID | null;
  name: string;
  code: string;
  retiredAt: Date | null;
  createdAt: Date;
}

export interface Department {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  name: string;
  managerTitle: string;
  createdBy: UUID;
  createdAt: Date;
}

export type DepartmentAssignmentLayer = 'MANAGER' | 'SUPERINTENDENT';
export type DepartmentPriority = 'HIGH' | 'MED_HIGH' | 'MEDIUM' | 'NORMAL';

export interface DepartmentTitle {
  id: UUID;
  tenantId: UUID;
  departmentId: UUID;
  title: string;
  defaultPriority: DepartmentPriority;
  assignmentLayer: DepartmentAssignmentLayer;
  createdAt: Date;
}

export interface DepartmentMembership {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  departmentId: UUID;
  userId: UUID;
  title: string | null;
  assignedBy: UUID | null;
  assignedAt: Date | null;
  superintendentId: UUID | null;
  deactivatedAt: Date | null;
  createdAt: Date;
}

export interface Company {
  id: UUID;
  tenantId: UUID;
  name: string;
  type: CompanyType;
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
