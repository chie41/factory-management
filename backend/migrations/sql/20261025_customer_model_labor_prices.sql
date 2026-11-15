BEGIN;
CREATE TABLE customer_model_labor_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  design_model_id uuid NOT NULL REFERENCES design_models(id),
  labor_price_per_15g numeric(20,4) CHECK(labor_price_per_15g>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(customer_id,design_model_id)
);
CREATE INDEX customer_model_labor_prices_model_idx ON customer_model_labor_prices(design_model_id);
COMMENT ON COLUMN customer_model_labor_prices.labor_price_per_15g IS 'Giá công giao hàng /15g bằng THB, theo đơn vị sổ giao hàng hiện có; NULL là chưa cấu hình';
COMMIT;
