BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:production'));
CREATE SEQUENCE production_batch_code_seq;
CREATE TABLE production_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(50) NOT NULL UNIQUE,
 design_model_id uuid NOT NULL REFERENCES design_models(id) ON DELETE RESTRICT,
 model_code_snapshot varchar(80) NOT NULL, model_name_snapshot varchar(180) NOT NULL,
 planned_quantity integer NOT NULL CHECK(planned_quantity>0), product_unit varchar(30) NOT NULL DEFAULT 'PCS' CHECK(product_unit='PCS'),
 status varchar(40) NOT NULL DEFAULT 'DRAFT',
 planned_start date, planned_end date, actual_start timestamptz, actual_end timestamptz,
 note text, source_revision_id uuid NOT NULL REFERENCES production_workflow_revisions(id) ON DELETE RESTRICT,
 source_metadata jsonb NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 request_id uuid NOT NULL UNIQUE, intent_hash text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(planned_end IS NULL OR planned_start IS NULL OR planned_end>=planned_start)
);
CREATE INDEX production_batches_created_idx ON production_batches(created_at DESC,id);
CREATE INDEX production_batches_model_status_idx ON production_batches(design_model_id,status);
CREATE TABLE batch_workflow_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES production_batches(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0), definition jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(batch_id,revision)
);
CREATE TABLE batch_steps (
 batch_id uuid NOT NULL REFERENCES production_batches(id) ON DELETE RESTRICT,
 step_id varchar(80) NOT NULL, display_order integer NOT NULL CHECK(display_order>=0),
 name varchar(180) NOT NULL CHECK(btrim(name)<>''), description text NOT NULL DEFAULT '',
 labor_rate_per_15g numeric(20,4) CHECK(labor_rate_per_15g>=0), requires_employee_confirmation boolean NOT NULL DEFAULT false,
 execution_started_at timestamptz,
 PRIMARY KEY(batch_id,step_id)
);
CREATE TABLE batch_step_dependencies (
 batch_id uuid NOT NULL, step_id varchar(80) NOT NULL, depends_on_id varchar(80) NOT NULL,
 PRIMARY KEY(batch_id,step_id,depends_on_id), CHECK(step_id<>depends_on_id),
 FOREIGN KEY(batch_id,step_id) REFERENCES batch_steps(batch_id,step_id) ON DELETE RESTRICT,
 FOREIGN KEY(batch_id,depends_on_id) REFERENCES batch_steps(batch_id,step_id) ON DELETE RESTRICT
);
CREATE TABLE batch_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES production_batches(id) ON DELETE RESTRICT,
 from_status varchar(40), to_status varchar(40) NOT NULL, reason text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX batch_status_history_batch_idx ON batch_status_history(batch_id,created_at,id);
CREATE TABLE batch_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES production_batches(id) ON DELETE RESTRICT,
 action varchar(80) NOT NULL, before_state jsonb, after_state jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX batch_audit_events_batch_idx ON batch_audit_events(batch_id,created_at,id);
CREATE FUNCTION production_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Production snapshots and history are append-only';
END;
$$;
CREATE TRIGGER batch_snapshot_immutable BEFORE UPDATE OR DELETE ON batch_workflow_snapshots FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TRIGGER batch_status_history_immutable BEFORE UPDATE OR DELETE ON batch_status_history FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TRIGGER batch_audit_immutable BEFORE UPDATE OR DELETE ON batch_audit_events FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE FUNCTION production_protect_batch_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.design_model_id,NEW.source_revision_id,NEW.source_metadata,NEW.model_code_snapshot,NEW.model_name_snapshot,NEW.product_unit)
   IS DISTINCT FROM (OLD.design_model_id,OLD.source_revision_id,OLD.source_metadata,OLD.model_code_snapshot,OLD.model_name_snapshot,OLD.product_unit) THEN
   RAISE EXCEPTION 'Production batch source snapshot is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER batch_source_immutable BEFORE UPDATE ON production_batches FOR EACH ROW EXECUTE FUNCTION production_protect_batch_source();
COMMIT;
