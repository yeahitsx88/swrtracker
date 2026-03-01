/**
 * Tenancy application layer.
 * Orchestrates use cases. Defines repository ports for infrastructure to implement.
 * Do not import from infrastructure here.
 */
export type {
  Tenant,
  Project,
  Company,
  Area,
  Subarea,
  PriorityWhitelistEntry,
  CompanyType,
  ProjectStatus,
} from '../domain/types';

// Use-case implementations added here in Phase 2.
