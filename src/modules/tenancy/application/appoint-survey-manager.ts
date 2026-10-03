import {ConflictError, ValidationError} from '@/shared/errors';
import type {DbClient, UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';

export interface ManagerSelection {outgoingUserId:UUID; incomingUserId:UUID; coverageUserId:UUID}
export interface ManagerAppointment extends ManagerSelection {snapshot:string; reason:string; confirmed:true}
export interface ManagerPreview {
 snapshot:string; outgoing:{userId:UUID;name:string}; incoming:{userId:UUID;name:string}; coverage:{userId:UUID;name:string};
 areaIds:UUID[]; reportingLinkIds:UUID[]; blockers:string[];
}
export interface ManagerAppointmentRepository {
 preview(db:DbClient,auth:AuthContext,projectId:UUID,selection:ManagerSelection):Promise<ManagerPreview>;
 appoint(db:DbClient,auth:AuthContext,projectId:UUID,input:ManagerAppointment,preview:ManagerPreview):Promise<{eventId:UUID;incomingUserId:UUID;coverageUserId:UUID}>;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function managerSelection(value:Record<string,unknown>):ManagerSelection {
 const keys=['outgoingUserId','incomingUserId','coverageUserId'] as const;
 if(!keys.every(k=>typeof value[k]==='string'&&uuid.test(value[k] as string)))throw new ValidationError('Select the outgoing manager, incoming Superintendent and coverage Superintendent');
 const ids=keys.map(k=>(value[k] as string).toLowerCase());
 if(new Set(ids).size!==3)throw new ValidationError('Select three different people');
 return Object.fromEntries(keys.map((k,i)=>[k,ids[i]])) as unknown as ManagerSelection;
}
export function parseManagerAppointment(value:unknown):ManagerAppointment {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('A confirmed manager appointment is required');
 const body=value as Record<string,unknown>,selection=managerSelection(body);
 if(Object.keys(body).some(k=>!['outgoingUserId','incomingUserId','coverageUserId','snapshot','reason','confirmed'].includes(k))||
  body.confirmed!==true||typeof body.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(body.snapshot)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>1000||/[\u0000-\u001f\u007f]/.test(body.reason))throw new ValidationError('Provide the displayed preview, a reason and explicit confirmation');
 return {...selection,snapshot:body.snapshot,reason:body.reason.trim(),confirmed:true};
}
/** Caller holds the EXCLUSIVE lifecycle barrier and current project administration authority.
 * The outgoing manager remains a historical manager until separately offboarded. */
export async function appointSurveyManager(repo:ManagerAppointmentRepository,db:DbClient,auth:AuthContext,projectId:UUID,input:ManagerAppointment){
 const preview=await repo.preview(db,auth,projectId,input);
 if(preview.snapshot!==input.snapshot)throw new ConflictError('Manager or staffing state changed; reload the handover','STALE_MANAGER_HANDOVER');
 if(preview.blockers.length)throw new ConflictError('Resolve the displayed manager handover obligations first','MANAGER_HANDOVER_BLOCKED');
 return repo.appoint(db,auth,projectId,input,preview);
}
