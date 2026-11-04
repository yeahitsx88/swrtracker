-- Decision 58: Sign In and Forgot Password ask only for email. Identity reads an
-- email's LOCAL accounts across tenants before a tenant is known, so the lookup
-- needs an index that does not lead with tenant_id. Per-tenant uniqueness
-- (UNIQUE tenant_id, email) is unchanged.
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email));
