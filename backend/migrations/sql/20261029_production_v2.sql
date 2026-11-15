BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:production'));
ALTER TABLE production_batches ADD COLUMN standard_weight_per_unit_g numeric(20,4) CHECK(standard_weight_per_unit_g>=0),
 ADD COLUMN planned_start_at timestamptz, ADD COLUMN planned_end_at timestamptz,
 ADD CHECK(planned_start_at IS NULL OR planned_end_at IS NULL OR planned_end_at>planned_start_at);
ALTER TABLE batch_steps ADD COLUMN estimated_duration_minutes integer CHECK(estimated_duration_minutes>=0);
ALTER TABLE batch_assignments ADD COLUMN applied_labor_rate_per_15g numeric(20,4) CHECK(applied_labor_rate_per_15g>=0);
CREATE TABLE batch_assignment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assignment_id uuid NOT NULL REFERENCES batch_assignments(id) ON DELETE RESTRICT,
 quantity_delta integer NOT NULL,resulting_quantity integer,kind varchar(10) NOT NULL CHECK(kind IN ('SET','ADD')),
 before_state jsonb,after_state jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE batch_worker_reconciliations (
 assignment_id uuid PRIMARY KEY REFERENCES batch_assignments(id) ON DELETE RESTRICT,
 status varchar(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED','ADJUSTING')),
 issued_gold_g numeric(24,4),received_gold_g numeric(24,4),difference_gold_g numeric(24,4),
 closed_by uuid REFERENCES users(id),closed_at timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE batch_reconciliation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assignment_id uuid NOT NULL REFERENCES batch_assignments(id) ON DELETE RESTRICT,
 action varchar(10) NOT NULL CHECK(action IN ('CLOSE','REOPEN')),reason text NOT NULL CHECK(btrim(reason)<>''),
 before_state jsonb,after_state jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER batch_assignment_events_immutable BEFORE UPDATE OR DELETE ON batch_assignment_events FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TRIGGER batch_reconciliation_events_immutable BEFORE UPDATE OR DELETE ON batch_reconciliation_events FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
ALTER TABLE batch_material_movements DROP CONSTRAINT batch_material_movements_kind_check;
ALTER TABLE batch_material_movements ADD CONSTRAINT batch_material_movements_kind_check CHECK(kind IN ('INITIAL','ADDITIONAL','RETURN_UNUSED','RETURN_TOTAL','RECEIVE_PRODUCT','TRANSFER_IN','TRANSFER_OUT'));
CREATE OR REPLACE FUNCTION production_protect_batch_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.design_model_id,NEW.source_revision_id,NEW.source_metadata,NEW.model_code_snapshot,NEW.model_name_snapshot,NEW.product_unit,NEW.standard_weight_per_unit_g)
 IS DISTINCT FROM (OLD.design_model_id,OLD.source_revision_id,OLD.source_metadata,OLD.model_code_snapshot,OLD.model_name_snapshot,OLD.product_unit,OLD.standard_weight_per_unit_g) THEN
 RAISE EXCEPTION 'Production batch source snapshot is immutable';
 END IF;
 RETURN NEW;
END;
$$;
COMMIT;
