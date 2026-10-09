import type {SubmittedRecoveryStatus} from '@/modules/workflow/domain/submitted-recovery';
export interface SubmittedRecoveryRecord {
 id:string;ticketNumber:string;description:string;requesterName:string;areaName:string|null;
 status:SubmittedRecoveryStatus;rowVersion:number;firstSubmittedAt:string;canRecover:boolean;blocker:string|null;
}
export interface SubmittedRecoveryPage {data:SubmittedRecoveryRecord[];total:number;offset:number;limit:number;readOnly:boolean}
export interface SubmittedRecoveryInput {expectedVersion:number;expectedStatus:SubmittedRecoveryStatus;reason:string;confirmed:true}
