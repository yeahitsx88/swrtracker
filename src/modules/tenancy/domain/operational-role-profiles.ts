import type {MemberInvitationRole} from './member-invitation';
/** Display reference; current authority and separate grants remain authoritative. */
export const OPERATIONAL_ROLE_PROFILES:Record<MemberInvitationRole,{visibility:string;responsibilities:string}>={
 REQUESTER:{visibility:'Own requests; subcontractor company visibility requires a separate company grant.',responsibilities:'Create and submit own requests, respond to corrections and cancel eligible requests.'},
 SURVEY_MANAGER:{visibility:'Project requests within current visibility rules.',responsibilities:'Survey review, assignment, priority and need-by changes; manage survey staffing.'},
 SURVEY_SUPERINTENDENT:{visibility:'Authorized Areas; linked crew views also require current staffing links.',responsibilities:'Area survey review requires a live Survey Reviewer grant; assignment and handover follow current coverage rules.'},
 PARTY_CHIEF:{visibility:'Requests assigned to this Party Chief.',responsibilities:'Allocate field work and perform permitted field review and coordination actions.'},
 INSTRUMENT_MAN:{visibility:'Directly assigned work or work for the currently linked Party Chief.',responsibilities:'Start, delay and complete directly assigned field work.'},
 CAD_TECHNICIAN:{visibility:'Project requests within current visibility rules.',responsibilities:'View project requests. CAD role membership does not grant Project Admin or survey review.'},
 CAD_LEAD:{visibility:'Project requests within current visibility rules.',responsibilities:'View project requests. CAD role membership does not grant Project Admin or survey review.'},
 VIEWER:{visibility:'Project requests within current visibility rules.',responsibilities:'View project work. The Viewer role does not grant project administration.'},
};
