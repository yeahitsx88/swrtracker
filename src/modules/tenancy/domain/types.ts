/**
 * Tenancy domain types — tenants, projects, companies, areas, subareas.
 * No I/O. No imports from infrastructure or application layers.
 */
import type { UUID } from '@/shared/types';

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

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
  createdAt: Date;
}

export interface Company {
  id: UUID;
  tenantId: UUID;
  name: string;
  type: CompanyType;
  createdAt: Date;
}

export interface Area {
  id: UUID;
  projectId: UUID;
  tenantId: UUID;
  name: string;
  code: string;   // short slug, e.g. "U1", "CT", "PR"
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
