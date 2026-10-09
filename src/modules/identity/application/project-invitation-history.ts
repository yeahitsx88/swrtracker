import {ValidationError} from '@/shared/errors';
import type {Page} from '@/shared/types';
import type {ProjectRole} from '../domain/types';
export type InvitationState='PENDING'|'ACCEPTED'|'EXPIRED'|'CANCELLED';
export type InvitationHistoryFilter=InvitationState|'HISTORY'|'ALL';
export interface InvitationHistoryQuery {state:InvitationHistoryFilter;search:string;limit:number;offset:number}
export interface ProjectInvitationRecord {id:string;email:string;role:ProjectRole;companyId:string;companyName:string;state:InvitationState;createdAt:string;expiresAt:string;acceptedAt:string|null;canceledAt:string|null;canCancel:boolean}
export interface ProjectInvitationHistory extends Page<ProjectInvitationRecord> {observedAt:string}
export function parseInvitationHistoryQuery(params:URLSearchParams):InvitationHistoryQuery {
 if([...params.keys()].some(key=>!['state','search','limit','offset'].includes(key))||['state','search','limit','offset'].some(key=>params.getAll(key).length>1))throw new ValidationError('Use one invitation state, search and page.');
 const state=params.get('state')??'HISTORY',search=(params.get('search')??'').trim(),limitText=params.get('limit')??'25',offsetText=params.get('offset')??'0';
 if(!['HISTORY','ALL','PENDING','ACCEPTED','EXPIRED','CANCELLED'].includes(state)||search.length>200||/[\x00-\x1f]/.test(search)||!/^\d+$/.test(limitText)||!/^\d+$/.test(offsetText))throw new ValidationError('Choose a valid invitation state, search (up to 200 characters), and page.');
 const limit=Number(limitText),offset=Number(offsetText);
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw new ValidationError('Invitation pages require a limit between 1 and 100 and a nonnegative offset.');
 return {state:state as InvitationHistoryFilter,search,limit,offset};
}
