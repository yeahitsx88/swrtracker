import type {UUID} from '@/shared/types';
import type {MemberInvitationRole,CustomRoleType} from './member-invitation';

/** A tenant label for an existing operational profile; authorization uses baseRole. */
export interface CustomRole {
 id:UUID; name:string; description:string; baseRole:MemberInvitationRole; createdAt:string;
}
export interface CustomRoleDirectory {roles:CustomRole[];canCreate:boolean}
export interface CreateCustomRole {name:string;description:string;baseRole:CustomRoleType;confirmed:true}
