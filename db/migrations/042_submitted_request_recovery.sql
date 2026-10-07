-- Decision51: bounded submitted recovery uses the existing correction event/cycle.
-- Preserve all historical rows and original origins. No status enum/map expansion.
BEGIN;
ALTER TABLE ticket_return_cycles DROP CONSTRAINT IF EXISTS ticket_return_cycles_origin_check;
ALTER TABLE ticket_return_cycles ADD CONSTRAINT ticket_return_cycles_origin_check
 CHECK (origin IN ('INITIAL_REVIEW','SURVEY_CHANGE','FIELD_INABILITY','SUBMITTED_RECOVERY'));
COMMIT;
