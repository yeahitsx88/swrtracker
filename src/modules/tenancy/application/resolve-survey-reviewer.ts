import {randomUUID} from 'node:crypto';
import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';
import {ConflictError,NotFoundError,ValidationError} from '@/shared/errors';
import {protectedUuid} from './read-protected-obligations';
import type {ProtectedObligationsRepository,ResolutionContext,ResolveReviewerInput,ResolveReviewerResult} from './protected-obligations.types';
export function parseReviewerResolution(value:unknown):ResolveReviewerInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('A confirmed reviewer handover is required');
 const body=value as Record<string,unknown>,additional=body.coverageMode==='assignAdditional';
 const allowed=['userId','grantId','replacementUserId','expectedSnapshot','confirmResolution','coverageMode',...(additional?['confirmAdditionalCoverage','coverageIntent']:[])];
 if(Object.keys(body).some(key=>!allowed.includes(key))||!['reuse','assignAdditional'].includes(body.coverageMode as string)||body.confirmResolution!==true||
 !['userId','grantId','replacementUserId'].every(key=>typeof body[key]==='string'&&protectedUuid.test(body[key] as string))||(body.userId as string).toLowerCase()===(body.replacementUserId as string).toLowerCase()||typeof body.expectedSnapshot!=='string'||!/^[a-f0-9]{32}$/.test(body.expectedSnapshot)||
 (additional&&(body.confirmAdditionalCoverage!==true||!['TEMPORARY','PERMANENT'].includes(body.coverageIntent as string))))throw new ValidationError('Choose one obligation, a different Superintendent, a snapshot and explicit coverage confirmation');
 return{...body,userId:(body.userId as string).toLowerCase(),grantId:(body.grantId as string).toLowerCase(),replacementUserId:(body.replacementUserId as string).toLowerCase()} as ResolveReviewerInput;
}
/** Lock current authority and historical identities before the retry ledger.
 * Fresh-only eligibility stays in resolveSurveyReviewer, so later coverage loss
 * never turns an exact historical retry into another grant creation. */
export async function authorizeReviewerResolution(repo:ProtectedObligationsRepository,db:DbClient,auth:AuthContext,projectId:UUID,input:ResolveReviewerInput){
 return repo.lockResolutionContext(db,auth,projectId,input);
}
export async function resolveSurveyReviewer(repo:ProtectedObligationsRepository,db:DbClient,context:ResolutionContext,input:ResolveReviewerInput):Promise<ResolveReviewerResult>{
 const {authority,subject,replacement,grant,area}=context;
 if(authority.project.status==='ARCHIVED')throw new ConflictError('Archived projects are read-only');
 if(subject.id!==input.userId||grant.id!==input.grantId||grant.userId!==subject.id||replacement.id!==input.replacementUserId)throw new NotFoundError('Scoped reviewer obligation not found');
 if(!subject.membershipId||!replacement.membershipId)throw new NotFoundError('Current project member not found');
 if(subject.deactivatedAt||subject.accessDisabledAt||subject.companyType==='SUBCONTRACTOR'||replacement.deactivatedAt||replacement.accessDisabledAt||replacement.companyType==='SUBCONTRACTOR'||replacement.role!=='SURVEY_SUPERINTENDENT'||replacement.id===subject.id)throw new ConflictError('Current eligible subject and replacement Superintendent are required');
 if(authority.branch==='SURVEY_MANAGER'&&!['VIEWER','REQUESTER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(subject.role??''))throw new ConflictError('This subject is outside Manager role-management scope');
 if(grant.revokedAt||grant.responsibility!=='SURVEY_REVIEWER'||!area||area.id!==grant.areaId||area.depth!==0||area.parentId||area.retiredAt)throw new ConflictError('Choose a current reviewer obligation on a live top-level Area');
 const scope={tenantId:authority.tenantId,projectId:authority.projectId};
 if(await repo.snapshot(db,scope,subject.id)!==input.expectedSnapshot)throw new ConflictError('Protected obligations changed; reload before confirming','STALE_PROTECTED_OBLIGATIONS');
 let replacementGrant=context.replacementGrant,replacementAssignment=context.replacementAssignment;
 const createdReviewGrant=!replacementGrant,createdIndividualAssignment=!replacementAssignment;
 if(input.coverageMode==='reuse'&&(createdReviewGrant||createdIndividualAssignment))throw new ConflictError('Existing exact-Area review and individual coverage are both required');
 if(input.coverageMode==='assignAdditional'&&!createdReviewGrant&&!createdIndividualAssignment)throw new ConflictError('Complete coverage already exists; reload and explicitly reuse it');
 const at=new Date().toISOString();
 if(!replacementAssignment)replacementAssignment=await repo.createIndividualCoverage(db,scope,replacement.id,area.id,randomUUID() as UUID,at);
 if(!replacementGrant)replacementGrant=await repo.createReviewCoverage(db,scope,replacement.id,area.id,authority.actorId,randomUUID() as UUID,at);
 if(replacementAssignment.userId!==replacement.id||replacementAssignment.areaId!==area.id||replacementAssignment.deactivatedAt||replacementGrant.userId!==replacement.id||replacementGrant.areaId!==area.id||replacementGrant.revokedAt||replacementGrant.responsibility!=='SURVEY_REVIEWER')throw new ConflictError('Complete exact-Area replacement coverage could not be established');
 if(!await repo.revokeSelectedGrant(db,scope,input,authority.actorId,at))throw new ConflictError('Selected reviewer obligation changed');
 const result:ResolveReviewerResult={resolved:true,grantId:grant.id,resolutionEventId:randomUUID() as UUID,resolvedAt:at,replacementUserId:replacement.id,replacementGrantId:replacementGrant.id,replacementAssignmentId:replacementAssignment.id,createdReviewGrant,createdIndividualAssignment};
 await repo.recordResolution(db,context,input,result,{grant:replacementGrant,assignment:replacementAssignment},at);
 return result;
}
