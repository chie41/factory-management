BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:production'));
CREATE TABLE batch_transaction_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL REFERENCES production_batches(id),
 transaction_id uuid NOT NULL,assignment_id uuid NOT NULL REFERENCES batch_assignments(id),
 action varchar(10) NOT NULL CHECK(action IN ('EDIT','VOID')),
 before_state jsonb NOT NULL,after_state jsonb NOT NULL,
 reason text NOT NULL CHECK(btrim(reason)<>''),actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX batch_transaction_changes_root_idx ON batch_transaction_changes(batch_id,transaction_id,created_at DESC,id DESC);
CREATE TRIGGER batch_transaction_changes_immutable BEFORE UPDATE OR DELETE ON batch_transaction_changes FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TABLE batch_output_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),output_id uuid NOT NULL REFERENCES batch_outputs(id),
 assignment_id uuid NOT NULL REFERENCES batch_assignments(id),quantity_delta integer NOT NULL CHECK(quantity_delta<>0),
 change_id uuid NOT NULL REFERENCES batch_transaction_changes(id),actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX batch_output_adjustments_output_idx ON batch_output_adjustments(output_id,assignment_id);
CREATE TRIGGER batch_output_adjustments_immutable BEFORE UPDATE OR DELETE ON batch_output_adjustments FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE VIEW batch_effective_output_contributions AS
 SELECT pc.output_id,pc.assignment_id,(pc.quantity+COALESCE((SELECT sum(a.quantity_delta) FROM batch_output_adjustments a WHERE a.output_id=pc.output_id AND a.assignment_id=pc.assignment_id),0))::int quantity
 FROM batch_output_contributions pc;
COMMIT;
