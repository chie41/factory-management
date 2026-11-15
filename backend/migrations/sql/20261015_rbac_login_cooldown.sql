BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:rbac'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_blocked_until timestamptz;
COMMIT;
