/**
 * Owner-approved (2026-10-09): the current project Survey Manager may give a
 * Survey Superintendent complete individual coverage of one live top-level Area
 * on an editable FULL project, including after activation. "Complete" coverage
 * is the established pair: an individual aor_assignment plus an active
 * SURVEY_REVIEWER grant on the same Area. Existing halves are reused, never
 * duplicated. Removal stays with the existing reviewed cleanup (Decision30/31).
 */
import {randomUUID} from 'node:crypto';
import {ConflictError,NotFoundError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import type {ProjectRole} from '@/modules/identity/domain/types';
import type {CrewBuild,ProjectStatus} from '../domain/types';
import type {IndividualAssignmentEvidence,ResolutionArea,ResolutionPerson,ResponsibilityGrantEvidence} from './protected-obligations.types';
import {protectedUuid} from './read-protected-obligations';

export type CoverageScope={tenantId:UUID;projectId:UUID};
export type CoverageAuthority=CoverageScope&{actorId:UUID;actorMembershipId:UUID;actorCompanyId:UUID;actorCompanyType:string;actorSessionVersion:number;project:{status:ProjectStatus;crewBuild:CrewBuild};expiresAt?:Date};
export type CoverageArea={areaId:UUID;areaName:string};
export type CoveredArea=CoverageArea&{assignmentId:UUID|null;reviewGrantId:UUID|null;complete:boolean};
export type SuperintendentCoverageReview={
 project:{status:ProjectStatus;crewBuild:CrewBuild};
 person:{userId:UUID;name:string;email:string;role:ProjectRole|null;active:boolean};
 snapshotToken:string;coveredAreas:CoveredArea[];grantableAreas:CoverageArea[];
};
export type GrantSuperintendentAreaInput={action:'grant-superintendent-area';superintendentId:UUID;areaId:UUID;expectedSnapshot:string;reason:string;confirmGrant:true};
export type GrantSuperintendentAreaResult={changed:true;eventId:UUID;grantedAt:string;areaId:UUID;assignmentId:UUID;reviewGrantId:UUID;createdIndividualAssignment:boolean;createdReviewGrant:boolean};
export type CoverageGrantContext={authority:CoverageAuthority;subject:ResolutionPerson;area:ResolutionArea;assignment:IndividualAssignmentEvidence|null;reviewGrant:ResponsibilityGrantEvidence|null;heldMembershipIds:UUID[]};

export interface SuperintendentCoverageRepository{
 review(db:DbClient,auth:AuthContext,projectId:UUID,superintendentId:UUID):Promise<SuperintendentCoverageReview>;
 lockGrantContext(db:DbClient,auth:AuthContext,projectId:UUID,input:GrantSuperintendentAreaInput):Promise<CoverageGrantContext>;
 assertNotCancelling(db:DbClient,scope:CoverageScope):Promise<void>;
 snapshot(db:DbClient,scope:CoverageScope,superintendentId:UUID):Promise<string>;
 createAssignment(db:DbClient,scope:CoverageScope,userId:UUID,areaId:UUID,id:UUID,at:string):Promise<IndividualAssignmentEvidence>;
 createReviewGrant(db:DbClient,scope:CoverageScope,userId:UUID,areaId:UUID,actorId:UUID,id:UUID,at:string):Promise<ResponsibilityGrantEvidence>;
 recordGrant(db:DbClient,context:CoverageGrantContext,input:GrantSuperintendentAreaInput,result:GrantSuperintendentAreaResult,coverage:{assignment:IndividualAssignmentEvidence;reviewGrant:ResponsibilityGrantEvidence}):Promise<void>;
}

export function parseSuperintendentId(value:string|null):UUID{
 const id=(value??'').toLowerCase();
 if(!protectedUuid.test(id))throw new ValidationError('Choose a valid Superintendent');
 return id as UUID;
}

export function parseGrantSuperintendentArea(value:unknown):GrantSuperintendentAreaInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('A confirmed Area coverage grant is required');
 const body=value as Record<string,unknown>;
 const keys=['action','superintendentId','areaId','expectedSnapshot','reason','confirmGrant'];
 if(Object.keys(body).some(key=>!keys.includes(key))||body.action!=='grant-superintendent-area'||body.confirmGrant!==true)throw new ValidationError('Review the Area coverage grant and confirm it explicitly');
 if(typeof body.superintendentId!=='string'||!protectedUuid.test(body.superintendentId)||typeof body.areaId!=='string'||!protectedUuid.test(body.areaId))throw new ValidationError('Choose one Superintendent and one Area');
 if(typeof body.expectedSnapshot!=='string'||!/^[a-f0-9]{32}$/.test(body.expectedSnapshot))throw new ValidationError('Reload the current coverage review before granting');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<10||reason.length>1000)throw new ValidationError('Give a reason of 10 to 1000 characters');
 return{action:'grant-superintendent-area',superintendentId:body.superintendentId.toLowerCase() as UUID,areaId:body.areaId.toLowerCase() as UUID,expectedSnapshot:body.expectedSnapshot,reason,confirmGrant:true};
}

/** Current actor and scope gates; repeated by the handler after lifecycle waits. */
export async function authorizeSuperintendentAreaGrant(repo:SuperintendentCoverageRepository,db:DbClient,auth:AuthContext,projectId:UUID,input:GrantSuperintendentAreaInput){
 return repo.lockGrantContext(db,auth,projectId,input);
}

/** Fresh-only rules: run inside the idempotency callback, never on a recorded replay. */
export async function grantSuperintendentArea(repo:SuperintendentCoverageRepository,db:DbClient,context:CoverageGrantContext,input:GrantSuperintendentAreaInput):Promise<GrantSuperintendentAreaResult>{
 const {authority,subject,area}=context,scope={tenantId:authority.tenantId,projectId:authority.projectId};
 if(authority.project.status==='ARCHIVED'||authority.project.crewBuild!=='FULL')throw new ConflictError('Area coverage requires an editable FULL project');
 await repo.assertNotCancelling(db,scope);
 if(subject.id!==input.superintendentId||area.id!==input.areaId)throw new NotFoundError('Scoped Superintendent or Area not found');
 if(!subject.membershipId||subject.deactivatedAt||subject.accessDisabledAt||subject.companyType==='SUBCONTRACTOR'||subject.role!=='SURVEY_SUPERINTENDENT')throw new ConflictError('Choose a current eligible Survey Superintendent');
 if(area.retiredAt||area.depth!==0||area.parentId)throw new ConflictError('Choose a live top-level Area');
 if(await repo.snapshot(db,scope,subject.id)!==input.expectedSnapshot)throw new ConflictError('Superintendent coverage changed; deliberately reload','STALE_SUPERINTENDENT_COVERAGE');
 if(context.assignment&&context.reviewGrant)throw new ConflictError('This Superintendent already has complete coverage of this Area','ALREADY_COVERED');
 const at=new Date().toISOString();
 const assignment=context.assignment??await repo.createAssignment(db,scope,subject.id,area.id,randomUUID() as UUID,at);
 const reviewGrant=context.reviewGrant??await repo.createReviewGrant(db,scope,subject.id,area.id,authority.actorId,randomUUID() as UUID,at);
 const result:GrantSuperintendentAreaResult={changed:true,eventId:randomUUID() as UUID,grantedAt:at,areaId:area.id,assignmentId:assignment.id,reviewGrantId:reviewGrant.id,createdIndividualAssignment:!context.assignment,createdReviewGrant:!context.reviewGrant};
 await repo.recordGrant(db,context,input,result,{assignment,reviewGrant});
 return result;
}
