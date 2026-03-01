/**
 * Repository ports for the Tenancy module.
 * Implemented by infrastructure/tenancy.repository.ts.
 */
import type { DbClient, UUID } from '@/shared/types';
import type {
  Tenant,
  Project,
  Company,
  Area,
  Subarea,
  PriorityWhitelistEntry,
} from '../domain/types';

export interface ITenancyRepository {
  // Tenants
  saveTenant(db: DbClient, tenant: Tenant): Promise<void>;

  // Companies
  saveCompany(db: DbClient, company: Company): Promise<void>;

  // Projects
  saveProject(db: DbClient, project: Project): Promise<void>;
  findProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null>;

  // Areas
  saveArea(db: DbClient, area: Area): Promise<void>;
  findAreaById(db: DbClient, tenantId: UUID, areaId: UUID): Promise<Area | null>;

  // Subareas
  saveSubarea(db: DbClient, subarea: Subarea): Promise<void>;

  // Project memberships
  saveMembership(db: DbClient, membership: {
    id: UUID;
    projectId: UUID;
    userId: UUID;
    role: string;
    createdAt: Date;
  }): Promise<void>;

  // Priority whitelist
  saveWhitelistEntry(db: DbClient, entry: PriorityWhitelistEntry): Promise<void>;
  deleteWhitelistEntry(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<void>;
  isEmailWhitelisted(db: DbClient, tenantId: UUID, projectId: UUID, email: string): Promise<boolean>;
}
