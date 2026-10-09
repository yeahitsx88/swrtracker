import type {DbClient,UUID} from '@/shared/types';

/** Caller owns the submission transaction. Team overlap never duplicates a recipient. */
export async function notifySurveySubmission(db:DbClient,tenantId:UUID,ticketId:UUID,actorId:UUID):Promise<void>{
 await db.query(`WITH RECURSIVE request AS (
 SELECT id,project_id,tenant_id,aor_node_id,ticket_number,return_cycle FROM tickets WHERE tenant_id=$1 AND id=$2
 ), ancestors AS (
 SELECT a.id,a.parent_id FROM aor_nodes a JOIN request r ON a.tenant_id=r.tenant_id AND a.project_id=r.project_id AND a.id=r.aor_node_id
 UNION SELECT a.id,a.parent_id FROM aor_nodes a JOIN ancestors parent ON parent.parent_id=a.id
 JOIN request r ON a.tenant_id=r.tenant_id AND a.project_id=r.project_id
 ), recipients AS (
 SELECT DISTINCT u.id FROM request r JOIN project_memberships pm ON pm.project_id=r.project_id
 JOIN users u ON u.id=pm.user_id AND u.tenant_id=r.tenant_id
 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
 WHERE pm.access_disabled_at IS NULL AND u.deactivated_at IS NULL AND
 (pm.role='SURVEY_MANAGER' OR (pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN') AND EXISTS(
 SELECT 1 FROM survey_team_members m JOIN survey_teams t ON t.tenant_id=m.tenant_id AND t.project_id=m.project_id AND t.id=m.team_id
 JOIN survey_team_areas ta ON ta.tenant_id=t.tenant_id AND ta.project_id=t.project_id AND ta.team_id=t.id
 WHERE m.tenant_id=r.tenant_id AND m.project_id=r.project_id AND m.user_id=u.id AND m.deactivated_at IS NULL
 AND t.deactivated_at IS NULL AND ta.deactivated_at IS NULL AND ta.area_id IN (SELECT id FROM ancestors))))
 ), notices AS (
 INSERT INTO survey_notifications(tenant_id,project_id,ticket_id,recipient_id,actor_id,event_key,title,message)
 SELECT r.tenant_id,r.project_id,r.id,p.id,$3,r.id::text || ':submitted:' || COALESCE(r.return_cycle,0)::text,
 CASE WHEN COALESCE(r.return_cycle,0)>0 THEN 'Request resubmitted' ELSE 'New survey request' END,
 COALESCE(r.ticket_number,'Survey request') || ' is ready for review in ' || COALESCE(a.name,'its selected Area') || '.'
 FROM request r CROSS JOIN recipients p LEFT JOIN aor_nodes a ON a.id=r.aor_node_id AND a.tenant_id=r.tenant_id AND a.project_id=r.project_id
 ON CONFLICT(tenant_id,recipient_id,event_key) DO NOTHING RETURNING recipient_id
 )
 INSERT INTO notification_outbox(tenant_id,ticket_id,recipient_user_id,event_type,payload,idempotency_key)
 SELECT r.tenant_id,r.id,n.recipient_id,'SURVEY_REQUEST_SUBMITTED',
 jsonb_build_object('ticketNumber',r.ticket_number,'returnCycle',COALESCE(r.return_cycle,0)),
 r.id::text || ':survey-submit:' || COALESCE(r.return_cycle,0)::text || ':' || n.recipient_id::text
 FROM request r CROSS JOIN notices n ON CONFLICT(tenant_id,idempotency_key) DO NOTHING`,[tenantId,ticketId,actorId]);
}
