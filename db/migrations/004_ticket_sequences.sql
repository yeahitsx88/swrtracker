-- Migration 004: Per-project ticket sequence counter.
-- Used to generate the zero-padded sequence component of the human-readable
-- ticket number (FSS-[AREA_CODE]-[ZERO_PADDED_SEQ]).
--
-- Ticket creation uses INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING
-- to atomically claim the next sequence within a transaction.

CREATE TABLE ticket_sequences (
  project_id UUID    NOT NULL PRIMARY KEY REFERENCES projects(id),
  last_seq   INTEGER NOT NULL DEFAULT 0
);
