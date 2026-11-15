BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:rbac'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_rbac;
UPDATE users SET status='LOCKED',updated_at=clock_timestamp() WHERE status IN ('DISABLED','INACTIVE');
ALTER TABLE users ADD CONSTRAINT users_status_rbac CHECK (status IN ('ACTIVE','LOCKED'));
CREATE OR REPLACE FUNCTION protect_user_employee() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
  RAISE EXCEPTION 'Account employee link is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_employee_immutable ON users;
CREATE TRIGGER users_employee_immutable BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION protect_user_employee();
COMMIT;
