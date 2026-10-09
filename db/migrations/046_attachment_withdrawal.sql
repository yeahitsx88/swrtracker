-- Uploader withdrawal of a mistaken file. The row and stored bytes are retained;
-- a withdrawn file is no longer downloadable and stops counting toward the
-- per-request file limit. Withdrawal is one-way and recorded in ticket history.
ALTER TABLE attachments
  ADD COLUMN withdrawn_at TIMESTAMPTZ,
  ADD COLUMN withdrawn_by UUID,
  ADD COLUMN withdrawal_reason TEXT;

ALTER TABLE attachments
  ADD CONSTRAINT attachments_withdrawal_complete CHECK (
    (withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdrawal_reason IS NULL)
    OR (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND length(btrim(withdrawal_reason)) BETWEEN 3 AND 500)
  );

ALTER TABLE attachments
  ADD CONSTRAINT attachments_withdrawn_by_fk FOREIGN KEY (tenant_id, withdrawn_by) REFERENCES users(tenant_id, id);

-- Withdrawal is final: refuse clearing or rewriting a recorded withdrawal.
CREATE FUNCTION refuse_attachment_withdrawal_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.withdrawn_at IS NOT NULL AND (
    NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at OR NEW.withdrawn_by IS DISTINCT FROM OLD.withdrawn_by
    OR NEW.withdrawal_reason IS DISTINCT FROM OLD.withdrawal_reason
  ) THEN
    RAISE EXCEPTION 'Attachment withdrawal is final' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attachments_withdrawal_final BEFORE UPDATE ON attachments
  FOR EACH ROW EXECUTE FUNCTION refuse_attachment_withdrawal_rewrite();
