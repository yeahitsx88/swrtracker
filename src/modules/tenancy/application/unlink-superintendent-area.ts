import {randomUUID} from 'node:crypto';
import {ConflictError,NotFoundError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import {protectedUuid} from './read-protected-obligations';
import type {SuperintendentAreaRepository,AreaUnlinkContext,UnlinkSuperintendentAreaInput,UnlinkSuperintendentAreaResult} from './superintendent-area.types';
export function parseSuperintendentAreaUnlink(value:unknown):UnlinkSuperintendentAreaInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('A confirmed individual Area unlink is required');
 const body=value as Record<string,unknown>,ids=['superintendentId','linkId','replacementUserId','replacementGrantId','replacementAssignmentId'];
 if(Object.keys(body).some(key=>!['action',...ids,'expectedSnapshot','confirmUnlink'].includes(key))||body.action!=='unlink-superintendent-area'||body.confirmUnlink!==true||!ids.every(key=>typeof body[key]==='string'&&protectedUuid.test(body[key] as string))||typeof body.expectedSnapshot!=='string'||!/^[a-f0-9]{32}$/.test(body.expectedSnapshot)||(body.superintendentId as string).toLowerCase()===(body.replacementUserId as string).toLowerCase())throw new ValidationError('Select one assignment, a different covered Superintendent, exact witnesses and explicit confirmation');
 return Object.fromEntries(Object.entries(body).map(([key,v])=>[key,ids.includes(key)?(v as string).toLowerCase():v])) as unknown as UnlinkSuperintendentAreaInput;
}
/** Historical ownership/current actor gates only. Fresh-only checks are below,
 * inside the idempotency callback, never on a completed historical replay. */
export async function authorizeSuperintendentAreaUnlink(repo:SuperintendentAreaRepository,db:DbClient,auth:AuthContext,projectId:UUID,input:UnlinkSuperintendentAreaInput){return repo.lockUnlinkContext(db,auth,projectId,input);}
export async function unlinkSuperintendentArea(repo:SuperintendentAreaRepository,db:DbClient,context:AreaUnlinkContext,input:UnlinkSuperintendentAreaInput):Promise<UnlinkSuperintendentAreaResult>{
 const {authority,subject,replacement,assignment,area,replacementGrant:g,replacementAssignment:a}=context;
 if(authority.project.status==='ARCHIVED'||authority.project.crewBuild!=='FULL')throw new ConflictError('Individual Superintendent cleanup requires an editable FULL project');
 if(subject.id!==input.superintendentId||assignment.id!==input.linkId||assignment.userId!==subject.id||replacement.id!==input.replacementUserId||area.id!==assignment.areaId)throw new NotFoundError('Scoped individual assignment not found');
 if(!subject.membershipId||!replacement.membershipId||subject.deactivatedAt||subject.accessDisabledAt||replacement.deactivatedAt||replacement.accessDisabledAt||subject.companyType==='SUBCONTRACTOR'||replacement.companyType==='SUBCONTRACTOR'||subject.role!=='SURVEY_SUPERINTENDENT'||replacement.role!=='SURVEY_SUPERINTENDENT'||subject.id===replacement.id)throw new ConflictError('Current eligible Superintendent identities are required');
 if(assignment.deactivatedAt||area.depth!==0||area.parentId||area.retiredAt)throw new ConflictError('Select an active individual assignment on a live top-level Area');
 if(!g||!a||g.id!==input.replacementGrantId||a.id!==input.replacementAssignmentId||g.userId!==replacement.id||a.userId!==replacement.id||g.areaId!==area.id||a.areaId!==area.id||g.responsibility!=='SURVEY_REVIEWER'||g.revokedAt||a.deactivatedAt)throw new ConflictError('Current exact selected review and individual coverage are both required');
 const scope={tenantId:authority.tenantId,projectId:authority.projectId};
 if(await repo.snapshot(db,scope,subject.id)!==input.expectedSnapshot)throw new ConflictError('Superintendent Area obligations changed; deliberately reload','STALE_SUPERINTENDENT_AREAS');
 if(context.responsibilityGrantIds.length||context.actingGrantIds.length)throw new ConflictError('Resolve protected responsibility or acting obligations first','PROTECTED_AREA_OBLIGATIONS');
 if(context.reportingLinkIds.length)throw new ConflictError('Resolve all dependent Chief reporting links first','DEPENDENT_REPORTING');
 const at=new Date().toISOString();
 if(!await repo.deactivateAssignment(db,scope,input,at))throw new ConflictError('The selected individual assignment changed','STALE_SUPERINTENDENT_AREAS');
 const result:UnlinkSuperintendentAreaResult={changed:true,assignmentId:assignment.id,unlinkedAt:at,unlinkEventId:randomUUID() as UUID,replacementUserId:replacement.id,replacementGrantId:g.id,replacementAssignmentId:a.id};
 await repo.recordUnlink(db,context,input,result);return result;
}
