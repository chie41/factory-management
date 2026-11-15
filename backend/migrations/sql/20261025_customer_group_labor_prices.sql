BEGIN;
CREATE TABLE customer_group_labor_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  design_model_group_id uuid NOT NULL REFERENCES design_model_groups(id) ON DELETE RESTRICT,
  labor_price_per_15g numeric(20,4) CHECK(labor_price_per_15g>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(customer_id,design_model_group_id)
);
CREATE INDEX customer_group_labor_prices_group_idx ON customer_group_labor_prices(design_model_group_id);
COMMENT ON COLUMN customer_group_labor_prices.labor_price_per_15g IS 'Giá công giao hàng /15g bằng THB; NULL là chưa cấu hình';
COMMIT;
