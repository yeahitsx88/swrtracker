/** Fixed operational roles already supported by project enrollment. */
export const MEMBER_INVITATION_ROLES=['REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER'] as const;
export const CUSTOM_ROLE_TYPES=['VIEWER','AREA_VIEWER','DEPARTMENT_MANAGER','SUBCONTRACTS_COORDINATOR'] as const;
export type CustomRoleType=typeof CUSTOM_ROLE_TYPES[number];
export const ENROLLMENT_ROLES=[...MEMBER_INVITATION_ROLES,...CUSTOM_ROLE_TYPES] as const;
export type MemberInvitationRole=typeof ENROLLMENT_ROLES[number];
