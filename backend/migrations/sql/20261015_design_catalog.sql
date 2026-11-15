BEGIN;
DO $$ BEGIN
 IF to_regclass('public.product_samples') IS NOT NULL THEN
  RAISE EXCEPTION 'Unexpected product_samples table: audit data and references before migrating; no historical data has been dropped';
 END IF;
END $$;
CREATE TABLE design_models (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code varchar(80) NOT NULL UNIQUE CHECK(btrim(code)<>''),name varchar(180) NOT NULL CHECK(btrim(name)<>''),
 status varchar(30) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 default_labor_price_per_15g numeric(20,4) CHECK(default_labor_price_per_15g>=0),default_labor_currency char(3) CHECK(default_labor_currency IN ('THB','LAK','VND')),
 image_url text,weight_g numeric(20,4) CHECK(weight_g>=0),design_description text,note text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),updated_by uuid REFERENCES users(id),
 CHECK(default_labor_price_per_15g IS NULL OR default_labor_currency IS NOT NULL)
);
CREATE TABLE components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code varchar(80) NOT NULL UNIQUE CHECK(btrim(code)<>''),name varchar(180) NOT NULL CHECK(btrim(name)<>''),
 weight_g numeric(20,4) CHECK(weight_g>=0),length_mm numeric(20,4) CHECK(length_mm>=0),width_mm numeric(20,4) CHECK(width_mm>=0),height_mm numeric(20,4) CHECK(height_mm>=0),attributes jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),updated_by uuid REFERENCES users(id)
);
CREATE TABLE boms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),design_model_id uuid NOT NULL REFERENCES design_models(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),updated_by uuid REFERENCES users(id)
);
CREATE INDEX boms_design_model_idx ON boms(design_model_id);
CREATE TABLE bom_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bom_id uuid NOT NULL REFERENCES boms(id) ON DELETE RESTRICT,
 item_type varchar(30) NOT NULL CHECK(item_type IN ('COMPONENT','AUX_MATERIAL')),component_id uuid REFERENCES components(id) ON DELETE RESTRICT,
 name_snapshot varchar(180),quantity numeric(20,4) CHECK(quantity>=0),weight_g numeric(20,4) CHECK(weight_g>=0),unit varchar(30) CHECK(unit IN ('PCS','G','CM')),
 CHECK((item_type='COMPONENT' AND component_id IS NOT NULL) OR (item_type='AUX_MATERIAL' AND component_id IS NULL AND btrim(name_snapshot)<>'')),
 CHECK(name_snapshot IS NOT NULL AND btrim(name_snapshot)<>'')
);
CREATE INDEX bom_items_component_idx ON bom_items(component_id);
CREATE INDEX bom_items_bom_idx ON bom_items(bom_id);
CREATE TABLE catalog_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mime_type varchar(30) NOT NULL,size_bytes integer NOT NULL CHECK(size_bytes>0),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE order_items ADD COLUMN design_model_id uuid REFERENCES design_models(id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD COLUMN design_code_snapshot varchar(80);
ALTER TABLE order_items ADD COLUMN design_image_snapshot text;
CREATE INDEX order_items_design_model_idx ON order_items(design_model_id);
COMMIT;
