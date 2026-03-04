-- Migration 009: assign ticket_number on DRAFT -> SUBMITTED instead of draft creation

ALTER TABLE tickets
  ALTER COLUMN ticket_number DROP NOT NULL;
