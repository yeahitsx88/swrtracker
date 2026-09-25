-- Background and query-time audit events have no human actor.
ALTER TABLE ticket_events ALTER COLUMN actor_id DROP NOT NULL;

-- The 18-hour and 24-hour notices are each emitted once per ticket.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_events_approver_timeout_once_idx
  ON ticket_events (ticket_id, event_type)
  WHERE event_type IN (
    'approver.timeout_warning_sent',
    'approver.timeout_unlocked'
  );

CREATE INDEX IF NOT EXISTS ticket_events_new_notification_scan_idx
  ON ticket_events (created_at, id)
  WHERE event_type IN (
    'help_flag.ticket_claimed',
    'approver.timeout_warning_sent',
    'approver.timeout_unlocked',
    'ticket.pc_approval_stuck'
  );
