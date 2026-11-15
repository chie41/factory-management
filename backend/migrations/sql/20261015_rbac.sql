BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:rbac'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_link_exempt boolean NOT NULL DEFAULT false;
UPDATE users SET employee_link_exempt=true WHERE username='admin' AND employee_id IS NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
CREATE TABLE IF NOT EXISTS security_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), target_id uuid,
 action text NOT NULL, before_state jsonb, after_state jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_target_idx ON security_audit(target_id,created_at);
-- Preserve legacy accounts lacking employees; new/updated rows must be linked.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_employee_required') THEN
  ALTER TABLE users ADD CONSTRAINT users_employee_required CHECK (employee_id IS NOT NULL OR employee_link_exempt) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_status_rbac') THEN
  ALTER TABLE users ADD CONSTRAINT users_status_rbac CHECK (status IN ('ACTIVE','DISABLED','LOCKED')) NOT VALID;
 END IF;
END $$;
-- Normalize the old inactive status only where an employee is already linked.
UPDATE users SET status='DISABLED' WHERE status='INACTIVE' AND employee_id IS NOT NULL;
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='public.users'::regclass AND contype='u'
 AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.users'::regclass AND attname='employee_id')]::smallint[]
 LOOP EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I',item.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_live_employee_unique ON users(employee_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_groups_single_group ON user_groups(user_id);
CREATE OR REPLACE FUNCTION protect_username() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.username IS DISTINCT FROM OLD.username THEN RAISE EXCEPTION 'username is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_username_immutable ON users;
CREATE TRIGGER users_username_immutable BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION protect_username();
COMMIT;

