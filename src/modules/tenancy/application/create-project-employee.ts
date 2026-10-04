import type { AuthContext } from '@/lib/auth';
import { assertProjectAdministrator } from '@/lib/project-capabilities';
import { acquireTenantLifecycleLock } from '@/lib/tenant-lifecycle-lock';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { createUser } from '@/modules/identity/application/create-user';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { TenancyRepository } from '../infrastructure/tenancy.repository';
import { addProjectMember } from './add-project-member';
import { setProjectAdministrator } from './project-administration';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { resolveCustomRoleSelection } from './custom-roles';

export const EMPLOYEE_ROLES = ['REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER'] as const;
export interface EmployeeInput { companyId: UUID; name: string; email: string; password: string; role: ProjectRole; customRoleId?: UUID; customRoleVersion?: number; projectAdmin: boolean; confirmed: true }

/** Explicit administrator provisioning, separate from public invitation registration. */
export async function createProjectEmployee(db: DbClient, auth: AuthContext, projectId: UUID, input: EmployeeInput) {
  await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
  const authority = await assertProjectAdministrator(db,auth,projectId);
  const project = (await db.query<{status:string}>('SELECT status FROM projects WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[auth.tenantId,projectId])).rows[0];
  if (!project) throw new NotFoundError('Project not found');
  if (project.status==='ARCHIVED') throw new ConflictError('Archived projects are read-only');
  const company = (await db.query<{type:string}>(`SELECT c.type FROM companies c JOIN project_companies pc ON pc.company_id=c.id AND pc.tenant_id=c.tenant_id
    WHERE pc.tenant_id=$1 AND pc.project_id=$2 AND c.id=$3`,[auth.tenantId,projectId,input.companyId])).rows[0];
  if (!company) throw new NotFoundError('Associate the company with this project first');
  if (company.type==='SUBCONTRACTOR' && (input.role!=='REQUESTER'||input.projectAdmin)) throw new ValidationError('Subcontractor accounts receive Requester access only');
  const customRole = await resolveCustomRoleSelection(db,auth.tenantId,input);
  const user = await createUser(new UserRepository(),db,{tenantId:auth.tenantId,companyId:input.companyId,name:input.name,email:input.email,password:input.password});
  await addProjectMember(new TenancyRepository(),db,{tenantId:auth.tenantId,projectId,userId:user.id,role:input.role,actorRole:authority.centralIT?'TENANT_ADMIN':'PROJECT_ADMIN'});
  if(customRole) await db.query('UPDATE project_memberships SET custom_role_id=$3 WHERE project_id=$1 AND user_id=$2',[projectId,user.id,customRole.id]);
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:user.id,eventType:'user.provisioned',
    authorityEvidence:{centralIT:authority.centralIT},changes:{companyId:input.companyId,accountCreated:true,membershipCreated:true,role:input.role,customRole}});
  if (input.projectAdmin) await setProjectAdministrator(db,auth,projectId,user.id,true);
  return {id:user.id,name:user.name,email:user.email,projectId,role:input.role,projectAdmin:input.projectAdmin};
}
