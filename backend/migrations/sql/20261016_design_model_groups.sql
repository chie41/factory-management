BEGIN;
CREATE TABLE design_model_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(180) NOT NULL CHECK(btrim(name)<>''),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),updated_by uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX design_model_groups_name_unique ON design_model_groups(lower(btrim(name)));
ALTER TABLE design_models ADD COLUMN group_id uuid REFERENCES design_model_groups(id) ON DELETE RESTRICT;
CREATE INDEX design_models_group_idx ON design_models(group_id);
COMMIT;
