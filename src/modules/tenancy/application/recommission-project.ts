import {ConflictError,ForbiddenError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import {getTenantRole} from '@/lib/get-tenant-role';
export interface RecommissionRecord {id:string;name:string;detail:string}
export interface RecommissionPreview {
 snapshot:string;status:string;periodId:string|null;replacementAdminId:string|null;
 candidates:RecommissionRecord[];members:RecommissionRecord[];companies:RecommissionRecord[];
 invitations:RecommissionRecord[];teams:RecommissionRecord[];work:RecommissionRecord[];
 blockers:string[];
}
export type RecommissionCommand={action:'BEGIN';snapshot:string;replacementAdminId:UUID;reason:string;confirmed:true}|{action:'OPEN';snapshot:string;reason:string;confirmed:true;retainedMembers:string[];retainedCompanies:string[];continuedWork:string[]};
export interface RecommissionRepository {
 preview(db:DbClient,auth:AuthContext,projectId:UUID):Promise<RecommissionPreview>;
 begin(db:DbClient,auth:AuthContext,projectId:UUID,command:Extract<RecommissionCommand,{action:'BEGIN'}>,preview:RecommissionPreview):Promise<{periodId:string}>;
 open(db:DbClient,auth:AuthContext,projectId:UUID,command:Extract<RecommissionCommand,{action:'OPEN'}>,preview:RecommissionPreview):Promise<{periodId:string}>;
}
export async function requireRecommissionAuthority(db:DbClient,auth:AuthContext){
 if(await getTenantRole(db,auth.tenantId,auth.userId,auth.sessionVersion)!=='TENANT_ADMIN')throw new ForbiddenError('Central IT is required to recommission a project.');
}
export function parseRecommissionCommand(value:unknown):RecommissionCommand{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('Review and confirm recommissioning.');
 const b=value as Record<string,unknown>,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(typeof b.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(b.snapshot)||b.confirmed!==true||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>2000)throw new ValidationError('The displayed snapshot, a reason and explicit confirmation are required.');
 const shared={snapshot:b.snapshot,reason:b.reason.trim(),confirmed:true as const};
 if(b.action==='BEGIN'&&typeof b.replacementAdminId==='string'&&uuid.test(b.replacementAdminId))return {...shared,action:'BEGIN',replacementAdminId:b.replacementAdminId as UUID};
 if(b.action==='OPEN'){
  const keys=['retainedMembers','retainedCompanies','continuedWork'] as const;
  for(const k of keys)if(!Array.isArray(b[k])||(b[k] as unknown[]).some(id=>typeof id!=='string'||!uuid.test(id))||new Set(b[k] as string[]).size!==(b[k] as string[]).length)throw new ValidationError('Provide distinct reviewed record IDs.');
  return {...shared,action:'OPEN',retainedMembers:b.retainedMembers as string[],retainedCompanies:b.retainedCompanies as string[],continuedWork:b.continuedWork as string[]};
 }
 throw new ValidationError('Choose preparation or reopening.');
}
function exact(expected:string[],actual:string[]){return expected.length===actual.length&&expected.every(id=>actual.includes(id));}
export async function recommissionProject(repo:RecommissionRepository,db:DbClient,auth:AuthContext,projectId:UUID,command:RecommissionCommand){
 await requireRecommissionAuthority(db,auth);
 const preview=await repo.preview(db,auth,projectId);
 if(command.snapshot!==preview.snapshot)throw new ConflictError('Project evidence changed. Reload and review the current records.','STALE_RECOMMISSIONING');
 if(command.action==='BEGIN'){
  if(preview.status!=='ARCHIVED'||preview.periodId)throw new ConflictError('Only an archived project without pending preparation can begin recommissioning.');
  if(!preview.candidates.some(c=>c.id===command.replacementAdminId))throw new ConflictError('Choose an eligible current account. Disabled project access cannot be restored by recommissioning.');
  return repo.begin(db,auth,projectId,command,preview);
 }
 if(preview.status!=='SETUP'||!preview.periodId)throw new ConflictError('This project has no pending recommissioning preparation.');
 if(preview.blockers.length)throw new ConflictError('Resolve the readiness blockers before reopening.');
 if(!exact(preview.members.map(r=>r.id),command.retainedMembers)||!exact(preview.companies.map(r=>r.id),command.retainedCompanies))throw new ConflictError('Review every retained member and company. Offboard departing personnel separately before reopening.');
 if(!exact(preview.work.map(r=>r.id),command.continuedWork))throw new ConflictError('Choose exactly one disposition for each unfinished request.');
 return repo.open(db,auth,projectId,command,preview);
}
