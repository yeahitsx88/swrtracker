CREATE INDEX IF NOT EXISTS project_request_observations_retention
 ON project_request_observations(tenant_id,observed_at,id);
