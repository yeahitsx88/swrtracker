/**
 * Identity domain types — users, roles, and auth primitives.
 * No I/O. No imports from infrastructure or application layers.
 */
import type { UUID } from '@/shared/types';

export type TenantRole = 'TENANT_ADMIN' | 'BILLING_VIEWER';

export type ProjectRole =
  | 'REQUESTER'
  | 'PROJECT_ADMIN'
  | 'SURVEY_MANAGER'
  | 'SURVEY_SUPERINTENDENT'
  | 'PARTY_CHIEF'
  | 'INSTRUMENT_MAN'
  | 'CAD_TECHNICIAN'
  | 'CAD_LEAD'
  | 'DEPARTMENT_MANAGER'
  | 'DEPARTMENT_LEAD'
  | 'VIEWER'
  | 'AREA_VIEWER'
  | 'SUBCONTRACTS_COORDINATOR';

export type Role = TenantRole | ProjectRole;

export type AuthMethod = 'LOCAL' | 'SSO';

export interface User {
  id: UUID;
  tenantId: UUID;
  companyId: UUID;
  email: string;
  name: string;
  authMethod: AuthMethod;
  createdAt: Date;
}

/** User with password hash — never returned to callers outside Identity module. */
export interface UserWithCredentials extends User {
  /** Nullable — null for SSO users. */
  passwordHash: string | null;
}

export interface ProjectMembership {
  id: UUID;
  projectId: UUID;
  userId: UUID;
  role: ProjectRole;
  createdAt: Date;
}
