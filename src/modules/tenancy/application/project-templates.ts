import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { CrewBuild } from '../domain/project-readiness';
import type { AorLevel, Department, Project, ProjectTemplate } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertTenantAdmin } from './shared';

interface TemplateInput {
  name: string;
  crewBuild: CrewBuild;
  aorLevelLabels: string[];
  departmentNames: string[];
}

function cleanNames(values: string[], label: string, max: number): string[] {
  if (!Array.isArray(values) || values.length > max) {
    throw new ValidationError(`${label} must contain at most ${max} names`);
  }
  const cleaned = values.map((value) => {
    if (typeof value !== 'string') throw new ValidationError(`${label} must contain only names`);
    const name = value.trim();
    if (!name || name.length > 80) throw new ValidationError(`${label} names must be 1-80 characters`);
    return name;
  });
  if (new Set(cleaned.map((name) => name.toLowerCase())).size !== cleaned.length) {
    throw new ValidationError(`${label} names must be unique`);
  }
  return cleaned;
}

function validateInput(input: TemplateInput): TemplateInput {
  const name = input.name.trim();
  if (!name || name.length > 100) throw new ValidationError('Template name must be 1-100 characters');
  if (!['FULL', 'MEDIUM', 'SLIM'].includes(input.crewBuild)) {
    throw new ValidationError('crewBuild must be FULL, MEDIUM, or SLIM');
  }
  const aorLevelLabels = cleanNames(input.aorLevelLabels, 'AOR level', 11);
  if (aorLevelLabels.length < 1) throw new ValidationError('At least one AOR level is required');
  const departmentNames = cleanNames(input.departmentNames, 'Department', 100);
  return { name, crewBuild: input.crewBuild, aorLevelLabels, departmentNames };
}

export async function listProjectTemplates(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; actorRole: TenantRole; limit: number; offset: number },
): Promise<{ templates: ProjectTemplate[]; total: number }> {
  assertTenantAdmin(params.actorRole);
  return repo.listProjectTemplates(db, params.tenantId, params.limit, params.offset);
}

export async function createProjectTemplate(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; actorId: UUID; actorRole: TenantRole } & TemplateInput,
): Promise<ProjectTemplate> {
  assertTenantAdmin(params.actorRole);
  const input = validateInput(params);
  const now = new Date();
  const template: ProjectTemplate = {
    id: randomUUID() as UUID, tenantId: params.tenantId,
    name: input.name, crewBuild: input.crewBuild,
    aorDepth: input.aorLevelLabels.length,
    aorLevelLabels: input.aorLevelLabels,
    departmentNames: input.departmentNames,
    createdBy: params.actorId, createdAt: now, updatedAt: now,
  };
  await repo.saveProjectTemplate(db, template);
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'template.created', { templateId: template.id,
      createdBy: params.actorId, templateName: template.name,
      crewBuild: template.crewBuild });
  return template;
}

export async function updateProjectTemplate(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; templateId: UUID; actorId: UUID;
    actorRole: TenantRole } & TemplateInput,
): Promise<ProjectTemplate> {
  assertTenantAdmin(params.actorRole);
  const input = validateInput(params);
  const previous = await repo.findProjectTemplate(
    db, params.tenantId, params.templateId, true,
  );
  if (!previous) throw new NotFoundError('Project template not found');
  const changed: string[] = [];
  if (previous.name !== input.name) changed.push('name');
  if (previous.crewBuild !== input.crewBuild) changed.push('crewBuild');
  if (JSON.stringify(previous.aorLevelLabels) !== JSON.stringify(input.aorLevelLabels)) {
    changed.push('aorLevelLabels');
  }
  if (JSON.stringify(previous.departmentNames) !== JSON.stringify(input.departmentNames)) {
    changed.push('departmentNames');
  }
  if (changed.length === 0) return previous;
  const updated: ProjectTemplate = { ...previous,
    ...input, aorDepth: input.aorLevelLabels.length, updatedAt: new Date() };
  if (!(await repo.updateProjectTemplate(db, updated))) {
    throw new ConflictError('Project template changed concurrently');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'template.updated', { templateId: updated.id,
      updatedBy: params.actorId, fieldsChanged: changed });
  return updated;
}

export async function deleteProjectTemplate(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; templateId: UUID; actorId: UUID;
    actorRole: TenantRole },
): Promise<void> {
  assertTenantAdmin(params.actorRole);
  const template = await repo.findProjectTemplate(
    db, params.tenantId, params.templateId, true,
  );
  if (!template) throw new NotFoundError('Project template not found');
  const projects = await repo.findTemplateProjectReferences(
    db, params.tenantId, params.templateId,
  );
  if (projects.length > 0) {
    throw new ConflictError(`Template is used by projects: ${projects.map((p) => p.name).join(', ')}`);
  }
  if (!(await repo.deleteProjectTemplate(db, params.tenantId, params.templateId))) {
    throw new ConflictError('Project template cannot be deleted while referenced');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'template.deleted', { templateId: params.templateId,
      templateName: template.name, deletedBy: params.actorId });
}

export async function createProjectFromTemplate(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; templateId: UUID; actorId: UUID;
    actorRole: TenantRole; name: string },
): Promise<Project> {
  assertTenantAdmin(params.actorRole);
  const name = params.name.trim();
  if (!name || name.length > 100) throw new ValidationError('Project name must be 1-100 characters');
  const template = await repo.findProjectTemplate(
    db, params.tenantId, params.templateId, true,
  );
  if (!template) throw new NotFoundError('Project template not found');
  const structure = validateInput(template);
  if (template.aorDepth !== structure.aorLevelLabels.length) {
    throw new ConflictError('Template AOR depth does not match its level labels');
  }
  const project: Project = {
    id: randomUUID() as UUID, tenantId: params.tenantId,
    name, status: 'SETUP', crewBuild: template.crewBuild,
    templateId: template.id, activatedAt: null, activatedBy: null,
    archivedAt: null, archivedBy: null, createdAt: new Date(),
  };
  await repo.saveProjectFromTemplate(db, project);
  for (const [depth, label] of structure.aorLevelLabels.entries()) {
    const level: AorLevel = { id: randomUUID() as UUID,
      tenantId: params.tenantId, projectId: project.id,
      depth, label, createdAt: new Date() };
    await repo.saveAorLevel(db, level);
  }
  for (const departmentName of structure.departmentNames) {
    const department: Department = {
      id: randomUUID() as UUID, tenantId: params.tenantId,
      projectId: project.id, name: departmentName,
      managerTitle: `${departmentName} Manager`,
      createdBy: params.actorId, createdAt: new Date(),
    };
    if (!(await repo.saveDepartment(db, department))) {
      throw new ConflictError(`Template department could not be created: ${departmentName}`);
    }
    await repo.saveDepartmentManagerTitle(db, department);
    await repo.appendTenantEvent(db, params.tenantId, params.actorId,
      'department.created', { projectId: project.id,
        departmentId: department.id, departmentName,
        managerTitle: department.managerTitle,
        aorNodeIds: [] });
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'project.template_applied', { projectId: project.id,
      templateId: template.id, templateName: template.name,
      applyingUserId: params.actorId });
  return project;
}
