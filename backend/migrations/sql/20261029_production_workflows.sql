BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:catalog'));
ALTER TABLE design_models ADD COLUMN workflow_mode varchar(10) NOT NULL DEFAULT 'INHERIT'
  CHECK (workflow_mode IN ('INHERIT','CUSTOM'));
-- Immutable definitions contain ordered steps and dependency edges (DAG).
-- RESTRICT preserves history when an owner has production configuration.
CREATE TABLE production_workflow_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid REFERENCES design_model_groups(id) ON DELETE RESTRICT,
 model_id uuid REFERENCES design_models(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((group_id IS NOT NULL)::integer+(model_id IS NOT NULL)::integer=1),
 UNIQUE(group_id,revision), UNIQUE(model_id,revision)
);
COMMIT;
