import type {UUID,Page,DbClient} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import type {ProjectStatus,CrewBuild} from '../domain/types';
import type {ProjectRole} from '@/modules/identity/domain/types';
import type {ResolutionPerson,IndividualAssignmentEvidence,ResponsibilityGrantEvidence,ResolutionArea} from './protected-obligations.types';
export type SuperintendentAreaPageQuery={search:string;limit:10|25|50|100;offset:number};
export type SuperintendentAreaReadQuery=
 |{mode:'superintendent-areas';superintendentId:UUID;query:SuperintendentAreaPageQuery}
 |{mode:'superintendent-area-replacements'|'superintendent-area-reporting';superintendentId:UUID;linkId:UUID;query:SuperintendentAreaPageQuery};
export type SuperintendentAreaAssignment={assignmentId:UUID;areaId:UUID;areaName:string;createdAt:string;retired:boolean;depth:number;parentId:UUID|null;duplicateIndividualCount:number;overlappingIndividualCount:number;responsibilityCount:number;actingCount:number;reportingCount:number;canUnlink:boolean;refusalReason:string|null};
export type SuperintendentAreaReplacement={userId:UUID;name:string;email:string;replacementGrantId:UUID;replacementAssignmentId:UUID};
export type SuperintendentAreaReporting={linkId:UUID;partyChiefId:UUID;name:string;email:string;role:ProjectRole|null;active:boolean;areaId:UUID;areaName:string;retired:boolean;canUseStaffing:boolean;refusalReason:string|null};
export type SuperintendentAreaReadResult={project:{status:ProjectStatus;crewBuild:CrewBuild};person:{userId:UUID;name:string;email:string;role:ProjectRole|null;active:boolean};snapshotToken:string}&(
 |{mode:'superintendent-areas';assignments:Page<SuperintendentAreaAssignment>;departmentMembershipCount:number;sharedDepartmentAssignmentCount:number}
 |{mode:'superintendent-area-replacements';replacements:Page<SuperintendentAreaReplacement>}
 |{mode:'superintendent-area-reporting';reporting:Page<SuperintendentAreaReporting>});
export type UnlinkSuperintendentAreaInput={action:'unlink-superintendent-area';superintendentId:UUID;linkId:UUID;replacementUserId:UUID;replacementGrantId:UUID;replacementAssignmentId:UUID;expectedSnapshot:string;confirmUnlink:true};
export type UnlinkSuperintendentAreaResult={changed:true;assignmentId:UUID;unlinkedAt:string;unlinkEventId:UUID;replacementUserId:UUID;replacementGrantId:UUID;replacementAssignmentId:UUID};

export type AreaUnlinkScope={tenantId:UUID;projectId:UUID};
export type AreaUnlinkAuthority=AreaUnlinkScope&{actorId:UUID;actorMembershipId:UUID;actorCompanyId:UUID;actorCompanyType:string;actorSessionVersion:number;project:{status:ProjectStatus;crewBuild:CrewBuild};expiresAt?:Date};
export type AreaUnlinkContext={authority:AreaUnlinkAuthority;subject:ResolutionPerson;replacement:ResolutionPerson;assignment:IndividualAssignmentEvidence;area:ResolutionArea;replacementGrant:ResponsibilityGrantEvidence|null;replacementAssignment:IndividualAssignmentEvidence|null;subtreeIds:UUID[];reportingLinkIds:UUID[];responsibilityGrantIds:UUID[];actingGrantIds:UUID[];heldMembershipIds:UUID[]};
export interface SuperintendentAreaRepository{
 readPage(db:DbClient,auth:AuthContext,projectId:UUID,input:SuperintendentAreaReadQuery):Promise<SuperintendentAreaReadResult>;
 lockUnlinkContext(db:DbClient,auth:AuthContext,projectId:UUID,input:UnlinkSuperintendentAreaInput):Promise<AreaUnlinkContext>;
 snapshot(db:DbClient,scope:AreaUnlinkScope,superintendentId:UUID):Promise<string>;
 deactivateAssignment(db:DbClient,scope:AreaUnlinkScope,input:UnlinkSuperintendentAreaInput,at:string):Promise<boolean>;
 recordUnlink(db:DbClient,context:AreaUnlinkContext,input:UnlinkSuperintendentAreaInput,result:UnlinkSuperintendentAreaResult):Promise<void>;
}
