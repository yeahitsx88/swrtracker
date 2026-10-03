/** Fixed operational roles already supported by project enrollment. */
export const MEMBER_INVITATION_ROLES=['REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER'] as const;
export type MemberInvitationRole=typeof MEMBER_INVITATION_ROLES[number];
