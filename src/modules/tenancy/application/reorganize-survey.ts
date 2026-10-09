import {ConflictError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {StaffingActor} from './save-survey-staffing';
export type ReorganizationSelection={kind:'CREW';partyChiefId:UUID;areaId:UUID;superintendentId:UUID|null;destinationTeamId?:UUID}|{kind:'INSTRUMENT_MAN';instrumentManId:UUID;partyChiefId:UUID;destinationTeamId:UUID};
export interface ReorganizationPreview{snapshot:string;selection:ReorganizationSelection;summary:string[];blockers:string[];activeWork:number;state:Record<string,unknown>}
export interface ReorganizationRepository{
 authorize(db:DbClient,actor:StaffingActor):Promise<void>;
 preview(db:DbClient,actor:StaffingActor,selection:ReorganizationSelection):Promise<ReorganizationPreview>;
 apply(db:DbClient,actor:StaffingActor,preview:ReorganizationPreview,reason:string):Promise<{changed:boolean}>;
}
export function parseReorganization(value:unknown,command=false):ReorganizationSelection&{snapshot?:string;reason?:string;confirmed?:true}{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('Choose a manpower move');
 const v=value as Record<string,unknown>,uuid=(key:string)=>{if(typeof v[key]!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v[key] as string))throw new ValidationError(`Valid ${key} required`);return (v[key] as string).toLowerCase() as UUID;};
 let selection:ReorganizationSelection;
 if(v.kind==='CREW')selection={kind:'CREW',partyChiefId:uuid('partyChiefId'),areaId:uuid('areaId'),superintendentId:v.superintendentId===null?null:uuid('superintendentId'),...('destinationTeamId' in v?{destinationTeamId:uuid('destinationTeamId')}:{})};
 else if(v.kind==='INSTRUMENT_MAN')selection={kind:'INSTRUMENT_MAN',instrumentManId:uuid('instrumentManId'),partyChiefId:uuid('partyChiefId'),destinationTeamId:uuid('destinationTeamId')};
 else throw new ValidationError('Unsupported manpower move');
 const allowed=[...Object.keys(selection),...(command?['snapshot','reason','confirmed']:[])];
 if(Object.keys(v).some(key=>!allowed.includes(key)))throw new ValidationError('Unexpected manpower selection field');
 if(!command)return selection;
 if(typeof v.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(v.snapshot)||typeof v.reason!=='string'||v.reason.trim().length<10||v.reason.trim().length>1000||/[\x00-\x1f]/.test(v.reason)||v.confirmed!==true)throw new ValidationError('Current preview, reason (10–1000 characters) and confirmation required');
 return {...selection,snapshot:v.snapshot,reason:v.reason.trim(),confirmed:true};
}
/** Caller holds the tenant EXCLUSIVE barrier and one transaction, including retry ledger. */
export async function reorganizeSurvey(repo:ReorganizationRepository,db:DbClient,actor:StaffingActor,input:ReorganizationSelection&{snapshot:string;reason:string;confirmed:true}){
 await repo.authorize(db,actor);
 const preview=await repo.preview(db,actor,input);
 if(preview.snapshot!==input.snapshot)throw new ConflictError('Manpower or work changed. Reload the preview before confirming','STALE_STAFFING');
 if(preview.blockers.length)throw new ConflictError(preview.blockers.join('; '),'MANPOWER_BLOCKED');
 return repo.apply(db,actor,preview,input.reason);
}
