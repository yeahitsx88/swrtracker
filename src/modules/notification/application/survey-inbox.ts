import { ForbiddenError, ValidationError } from '@/shared/errors';
import type {DbClient} from '@/shared/types';
import type {TeamActor} from '@/modules/tenancy/application/survey-teams';
import {resolveVisibility} from '@/lib/resolve-visibility';
import {buildVisibilityClause} from '@/lib/ticket-visibility-clause';
export interface SurveyNotice {id:string;title:string;message:string;createdAt:string;ticketId:string|null}
export interface SurveyInbox {messages:SurveyNotice[];hasMore:boolean}
export async function readSurveyInbox(db:DbClient,actor:TeamActor,offset:number):Promise<SurveyInbox>{
 if(!['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(actor.actorRole))throw new ForbiddenError('Survey notifications are available to survey personnel.');
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new ValidationError('Choose a valid notifications page.');
 const visibility=await resolveVisibility(db,actor.tenantId,actor.projectId,actor.actorId,actor.actorRole);
 const clause=buildVisibilityClause(visibility,7);
 const {rows}=await db.query<SurveyNotice>(`SELECT n.id,n.title,n.message,n.created_at AS "createdAt",
 CASE WHEN EXISTS(SELECT t.id FROM tickets t WHERE t.tenant_id=n.tenant_id AND t.project_id=n.project_id AND t.id=n.ticket_id ${clause.sql})
 THEN n.ticket_id ELSE NULL END AS "ticketId"
 FROM survey_notifications n JOIN project_memberships pm ON pm.project_id=n.project_id AND pm.user_id=n.recipient_id
 JOIN users u ON u.id=pm.user_id AND u.tenant_id=n.tenant_id
 WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.recipient_id=$3 AND pm.role=$4
 AND pm.access_disabled_at IS NULL AND u.deactivated_at IS NULL AND u.session_version=$5
 ORDER BY n.created_at DESC,n.id DESC LIMIT 26 OFFSET $6`,[actor.tenantId,actor.projectId,actor.actorId,actor.actorRole,actor.sessionVersion,offset,...clause.params]);
 return {messages:rows.slice(0,25),hasMore:rows.length>25};
}
