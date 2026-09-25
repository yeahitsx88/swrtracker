-- Submission validates an exact 48-hour interval. DATE discarded the time
-- accepted by the API. Preserve historical calendar dates at midnight UTC;
-- future writes retain the full requested execution instant.
DO $$
DECLARE column_type TEXT;
BEGIN
  SELECT data_type INTO column_type FROM information_schema.columns
  WHERE table_schema=current_schema() AND table_name='tickets'
    AND column_name='requested_date';
  IF column_type='date' THEN
    ALTER TABLE tickets ALTER COLUMN requested_date TYPE TIMESTAMPTZ
      USING requested_date::timestamp AT TIME ZONE 'UTC';
  ELSIF column_type IS DISTINCT FROM 'timestamp with time zone' THEN
    RAISE EXCEPTION 'Unexpected tickets.requested_date type: %', column_type;
  END IF;
END $$;
