ALTER TABLE survey_notifications ADD COLUMN ticket_id UUID;
ALTER TABLE survey_notifications ADD CONSTRAINT survey_notification_ticket_fk
  FOREIGN KEY (tenant_id,ticket_id) REFERENCES tickets(tenant_id,id);

-- Attach known submission/proposal notices to their existing scoped request.
UPDATE survey_notifications n SET ticket_id=t.id
FROM tickets t WHERE t.tenant_id=n.tenant_id AND t.project_id=n.project_id
  AND n.event_key LIKE t.id::text || ':submitted:%';
UPDATE survey_notifications n SET ticket_id=p.ticket_id
FROM survey_rejection_proposals p
WHERE p.tenant_id=n.tenant_id AND p.project_id=n.project_id
  AND n.event_key='rejection-proposal:' || p.id::text;
