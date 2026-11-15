BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:production'));
-- UPDATE remains forbidden. DELETE is allowed only for exact row IDs validated
-- by the service and scoped to the current database transaction.
CREATE FUNCTION production_guard_transaction_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope jsonb; row_key text;
BEGIN
 IF TG_OP='DELETE' THEN
  scope=COALESCE(NULLIF(current_setting('factory.production_delete_scope',true),'')::jsonb,'{}'::jsonb);
  row_key=COALESCE(to_jsonb(OLD)->>'id',to_jsonb(OLD)->>'output_id');
  IF COALESCE((scope->TG_TABLE_NAME) ? row_key,false) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Production transaction history is protected; use the validated delete operation';
END;
$$;
DROP TRIGGER batch_assignment_events_immutable ON batch_assignment_events;
CREATE TRIGGER batch_assignment_events_immutable BEFORE UPDATE OR DELETE ON batch_assignment_events FOR EACH ROW EXECUTE FUNCTION production_guard_transaction_delete();
DROP TRIGGER batch_materials_immutable ON batch_material_movements;
CREATE TRIGGER batch_materials_immutable BEFORE UPDATE OR DELETE ON batch_material_movements FOR EACH ROW EXECUTE FUNCTION production_guard_transaction_delete();
DROP TRIGGER batch_outputs_immutable ON batch_outputs;
CREATE TRIGGER batch_outputs_immutable BEFORE UPDATE OR DELETE ON batch_outputs FOR EACH ROW EXECUTE FUNCTION production_guard_transaction_delete();
DROP TRIGGER batch_contributions_immutable ON batch_output_contributions;
CREATE TRIGGER batch_contributions_immutable BEFORE UPDATE OR DELETE ON batch_output_contributions FOR EACH ROW EXECUTE FUNCTION production_guard_transaction_delete();
DROP TRIGGER batch_transaction_changes_immutable ON batch_transaction_changes;
CREATE TRIGGER batch_transaction_changes_immutable BEFORE UPDATE OR DELETE ON batch_transaction_changes FOR EACH ROW EXECUTE FUNCTION production_guard_transaction_delete();
DROP TRIGGER batch_output_adjustments_immutable ON batch_output_adjustments;
CREATE TRIGGER batch_output_adjustments_immutable BEFORE UPDATE OR DELETE ON batch_output_adjustments FOR EACH ROW EXECUTE FUNCTION production_guard_transaction_delete();
COMMIT;
