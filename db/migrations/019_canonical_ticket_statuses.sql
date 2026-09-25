-- Replace retired ticket statuses without rewriting append-only ticket_events.
-- The legacy cancellation API allowed any project member to request cancellation
-- and did not record a reason or cancellation path. Only evidence-backed rows can
-- be translated. An exception lists rows requiring an owner decision; the whole
-- migration then rolls back, including any status changes.

CREATE TEMP TABLE phase2_status_backfill ON COMMIT DROP AS
WITH evidence AS (
  SELECT t.id, t.tenant_id, t.status AS legacy_status, t.requester_id,
         t.assigned_party_chief_id, t.survey_superintendent_id,
         t.assigned_at, t.started_at, t.completed_at, t.closed_at,
         t.cancel_reason, t.cancel_initiated_by, t.cancel_initiated_at,
         t.cancel_initiator_role,
         last_event.event_type AS last_type, last_event.actor_id AS last_actor,
         last_event.created_at AS last_at, last_event.same_time AS last_ties,
         prior_event.event_type AS prior_type, prior_event.actor_id AS prior_actor,
         prior_event.created_at AS prior_at, prior_event.same_time AS prior_ties,
         work_event.event_type AS work_type, work_event.created_at AS work_at,
         work_event.same_time AS work_ties
  FROM tickets t
  LEFT JOIN LATERAL (
    SELECT e.event_type, e.actor_id, e.created_at,
           count(*) OVER (PARTITION BY e.created_at) AS same_time
    FROM ticket_events e
    WHERE e.ticket_id = t.id AND e.tenant_id = t.tenant_id
      AND e.event_type IN (
        'ticket.created', 'ticket.submitted', 'ticket.approved',
        'ticket.rejected', 'ticket.rejection_overridden',
        'ticket.assigned', 'ticket.unassigned', 'ticket.in_progress',
        'ticket.pending_pc_approval', 'ticket.completed', 'ticket.delayed',
        'ticket.delay_restarted', 'ticket.field_canceled',
        'ticket.requester_canceled', 'ticket.survey_canceled',
        'ticket.closed', 'ticket.cancel_requested',
        'ticket.cancel_approved', 'ticket.cancel_rejected'
      )
    ORDER BY e.created_at DESC, e.id DESC LIMIT 1
  ) last_event ON true
  LEFT JOIN LATERAL (
    SELECT e.event_type, e.actor_id, e.created_at,
           count(*) OVER (PARTITION BY e.created_at) AS same_time
    FROM ticket_events e
    WHERE e.ticket_id = t.id AND e.tenant_id = t.tenant_id
      AND e.created_at < last_event.created_at
      AND e.event_type IN (
        'ticket.created', 'ticket.submitted', 'ticket.approved',
        'ticket.rejected', 'ticket.rejection_overridden',
        'ticket.assigned', 'ticket.unassigned', 'ticket.in_progress',
        'ticket.pending_pc_approval', 'ticket.completed', 'ticket.delayed',
        'ticket.delay_restarted', 'ticket.field_canceled',
        'ticket.requester_canceled', 'ticket.survey_canceled',
        'ticket.closed', 'ticket.cancel_requested',
        'ticket.cancel_approved', 'ticket.cancel_rejected'
      )
    ORDER BY e.created_at DESC, e.id DESC LIMIT 1
  ) prior_event ON true
  LEFT JOIN LATERAL (
    SELECT e.event_type, e.created_at,
           count(*) OVER (PARTITION BY e.created_at) AS same_time
    FROM ticket_events e
    WHERE e.ticket_id = t.id AND e.tenant_id = t.tenant_id
      AND e.created_at < prior_event.created_at
      AND e.event_type IN (
        'ticket.created', 'ticket.submitted', 'ticket.approved',
        'ticket.rejected', 'ticket.rejection_overridden',
        'ticket.assigned', 'ticket.unassigned', 'ticket.in_progress',
        'ticket.pending_pc_approval', 'ticket.completed', 'ticket.delayed',
        'ticket.delay_restarted', 'ticket.field_canceled',
        'ticket.requester_canceled', 'ticket.survey_canceled',
        'ticket.closed', 'ticket.cancel_requested',
        'ticket.cancel_approved', 'ticket.cancel_rejected'
      )
    ORDER BY e.created_at DESC, e.id DESC LIMIT 1
  ) work_event ON true
  WHERE t.status IN ('CLOSED', 'CANCEL_REQUESTED',
                     'CANCEL_APPROVED', 'CANCEL_REJECTED')
), decision AS (
  SELECT e.*,
    CASE
      WHEN last_ties = 1 AND prior_ties = 1
        AND legacy_status = 'CLOSED'
        AND last_type = 'ticket.closed' AND prior_type = 'ticket.completed'
        AND completed_at IS NOT NULL AND closed_at IS NOT NULL
        AND closed_at >= completed_at
        THEN 'COMPLETED'
      WHEN last_ties = 1 AND prior_ties = 1
        AND legacy_status = 'CANCEL_REQUESTED'
        AND last_type = 'ticket.cancel_requested'
        AND prior_type IN ('ticket.assigned', 'ticket.in_progress')
        AND assigned_at IS NOT NULL
        AND (prior_type <> 'ticket.in_progress' OR started_at IS NOT NULL)
        AND completed_at IS NULL AND closed_at IS NULL
        AND cancel_initiated_by = last_actor
        AND cancel_initiated_at IS NOT NULL
        AND nullif(btrim(cancel_reason), '') IS NOT NULL
        AND ((cancel_initiator_role = 'PARTY_CHIEF'
              AND last_actor = assigned_party_chief_id)
          OR (cancel_initiator_role = 'SURVEY_SUPERINTENDENT'
              AND last_actor = survey_superintendent_id))
        THEN CASE prior_type WHEN 'ticket.assigned' THEN 'ASSIGNED'
                             ELSE 'IN_PROGRESS' END
      WHEN last_ties = 1 AND prior_ties = 1 AND work_ties = 1
        AND legacy_status = 'CANCEL_APPROVED'
        AND last_type = 'ticket.cancel_approved'
        AND prior_type = 'ticket.cancel_requested'
        AND work_type IN ('ticket.assigned', 'ticket.in_progress')
        AND prior_actor = requester_id
        AND assigned_at IS NOT NULL
        AND (work_type <> 'ticket.in_progress' OR started_at IS NOT NULL)
        AND completed_at IS NULL AND closed_at IS NULL
        THEN 'REQUESTER_CANCELED'
      WHEN last_ties = 1 AND prior_ties = 1 AND work_ties = 1
        AND legacy_status = 'CANCEL_REJECTED'
        AND last_type = 'ticket.cancel_rejected'
        AND prior_type = 'ticket.cancel_requested'
        AND work_type IN ('ticket.assigned', 'ticket.in_progress')
        AND assigned_at IS NOT NULL
        AND (work_type <> 'ticket.in_progress' OR started_at IS NOT NULL)
        AND completed_at IS NULL AND closed_at IS NULL
        THEN CASE work_type WHEN 'ticket.assigned' THEN 'ASSIGNED'
                            ELSE 'IN_PROGRESS' END
    END AS target_status
  FROM evidence e
)
SELECT id, tenant_id, legacy_status, target_status, last_at
FROM decision;

-- To inspect unresolved rows before retrying, run the SELECT above without the
-- CREATE TEMP TABLE wrapper and filter WHERE target_status IS NULL. The error
-- below also includes a bounded ID/status list for the migration operator.
DO $$
DECLARE unresolved_count bigint;
DECLARE unresolved_sample text;
DECLARE unknown_count bigint;
DECLARE unknown_sample text;
BEGIN
  SELECT count(*), string_agg(id::text || ' (' || legacy_status || ')', ', ')
    INTO unresolved_count, unresolved_sample
  FROM (SELECT id, legacy_status FROM phase2_status_backfill
        WHERE target_status IS NULL ORDER BY id LIMIT 20) unresolved;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Canonical ticket status backfill requires manual resolution for at least % row(s): %',
      unresolved_count, unresolved_sample;
  END IF;

  SELECT count(*), string_agg(id::text || ' (' || status || ')', ', ')
    INTO unknown_count, unknown_sample
  FROM (SELECT id, status FROM tickets WHERE status NOT IN (
    'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CREATED', 'ASSIGNED',
    'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED', 'FIELD_CANCELED',
    'COMPLETED', 'REQUESTER_CANCELED', 'SURVEY_CANCELED', 'CLOSED',
    'CANCEL_REQUESTED', 'CANCEL_APPROVED', 'CANCEL_REJECTED'
  ) ORDER BY id LIMIT 20) unknown;
  IF unknown_count > 0 THEN
    RAISE EXCEPTION 'Unknown ticket statuses require manual resolution for at least % row(s): %',
      unknown_count, unknown_sample;
  END IF;
END $$;

UPDATE tickets t SET
  status = p.target_status,
  canceled_at = CASE WHEN p.target_status = 'REQUESTER_CANCELED'
                     THEN coalesce(t.canceled_at, p.last_at)
                     ELSE t.canceled_at END,
  cancel_initiated_at = CASE WHEN p.legacy_status = 'CANCEL_REJECTED'
                             THEN NULL ELSE t.cancel_initiated_at END,
  cancel_initiated_by = CASE WHEN p.legacy_status = 'CANCEL_REJECTED'
                             THEN NULL ELSE t.cancel_initiated_by END,
  cancel_initiator_role = CASE WHEN p.legacy_status = 'CANCEL_REJECTED'
                               THEN NULL ELSE t.cancel_initiator_role END
FROM phase2_status_backfill p
WHERE t.id = p.id AND t.tenant_id = p.tenant_id;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'tickets'::regclass
                   AND conname = 'tickets_status_canonical_check') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_status_canonical_check CHECK (
      status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CREATED',
                 'ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED',
                 'FIELD_CANCELED', 'COMPLETED', 'REQUESTER_CANCELED',
                 'SURVEY_CANCELED')
    ) NOT VALID;
  END IF;
END $$;
ALTER TABLE tickets VALIDATE CONSTRAINT tickets_status_canonical_check;
