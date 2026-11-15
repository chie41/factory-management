BEGIN;
-- Zero products is a material-only recipient, never an implicit product assignment.
-- Existing positive/null quantities and immutable histories are preserved.
ALTER TABLE batch_assignments DROP CONSTRAINT batch_assignments_planned_quantity_check;
ALTER TABLE batch_assignments ADD CONSTRAINT batch_assignments_planned_quantity_check CHECK (planned_quantity >= 0);
COMMIT;
