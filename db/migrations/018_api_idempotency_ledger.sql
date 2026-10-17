CREATE TABLE IF NOT EXISTS api_idempotency (
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NULL,
  response_body JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, actor_id, endpoint, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_created_at
  ON api_idempotency (created_at);
