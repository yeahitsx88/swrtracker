import type {AuthContext} from '@/lib/auth';
import {getTenantRole} from '@/lib/get-tenant-role';
import type {DbClient,UUID} from '@/shared/types';
import {ConflictError,ForbiddenError,NotFoundError,ValidationError} from '@/shared/errors';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {findCustomRole,insertCustomRole} from '../infrastructure/custom-role.repository';
import {MEMBER_INVITATION_ROLES,CUSTOM_ROLE_TYPES} from '../domain/member-invitation';
import type {CreateCustomRole} from '../domain/custom-role';

export function validateCustomRole(input:CreateCustomRole):void {
 if(!input.name||input.name.length>80||input.description.length>500||/[\u0000-\u001f\u007f]/.test(input.name+input.description))throw new ValidationError('Enter a role name (up to 80 characters) and an optional description (up to 500 characters).');
 if(!CUSTOM_ROLE_TYPES.includes(input.baseRole))throw new ValidationError('Choose Viewer, Area Viewer, Department Manager or Subcontractor Coordinator');
 const reserved=['TENANT IT','CENTRAL IT','TENANT ADMIN','PROJECT ADMIN','BILLING VIEWER','AREA VIEWER','DEPARTMENT MANAGER','DEPARTMENT LEAD','SUBCONTRACTS COORDINATOR','SUBCONTRACTOR COORDINATOR',...MEMBER_INVITATION_ROLES.map(r=>r.replaceAll('_',' '))];
 if(reserved.includes(input.name.toUpperCase().replace(/[_\s]+/g,' ')))throw new ValidationError('Use a custom name distinct from the built-in roles and administrative authorities');
}
export async function authorizeCustomRoleCreation(db:DbClient,auth:AuthContext):Promise<void> {
 if(await getTenantRole(db,auth.tenantId,auth.userId,auth.sessionVersion)!=='TENANT_ADMIN')throw new ForbiddenError('Only Tenant IT can create tenant-wide custom roles');
}
/** Caller holds EXCLUSIVE lifecycle barrier; fresh authority precedes recorded replay. */
export async function createCustomRole(db:DbClient,auth:AuthContext,input:CreateCustomRole) {
 await authorizeCustomRoleCreation(db,auth);validateCustomRole(input);
 const role=await insertCustomRole(db,auth.tenantId,auth.userId,input);
 if(!role)throw new ConflictError('A custom role with this name already exists. Reload roles and choose another name.');
 await appendAdministrativeEvent(db,{auth,projectId:null,subjectUserId:null,eventType:'tenant.custom_role_created',authorityEvidence:{actorRole:'TENANT_ADMIN'},changes:{customRoleId:role.id,name:role.name,description:role.description,baseRole:role.baseRole}});
 return {role};
}
export async function resolveCustomRole(db:DbClient,tenantId:UUID,id:UUID|undefined,baseRole:string) {
 if(!id){if(['AREA_VIEWER','DEPARTMENT_MANAGER','SUBCONTRACTS_COORDINATOR'].includes(baseRole))throw new ValidationError('Select a saved tenant custom role for this permission profile');return undefined;}
 const role=await findCustomRole(db,tenantId,id);
 if(!role)throw new NotFoundError('Custom role not found in this tenant');
 if(role.baseRole!==baseRole)throw new ConflictError('The custom role does not match the reviewed permission profile. Reload and choose the role again.');
 return role;
}
