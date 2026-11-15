BEGIN;
ALTER TABLE design_model_groups ADD COLUMN default_labor_price_per_15g numeric(20,4)
  CHECK(default_labor_price_per_15g>=0);
COMMENT ON COLUMN design_model_groups.default_labor_price_per_15g IS 'Giá công mặc định /15g bằng THB; NULL là chưa thiết lập';
COMMENT ON COLUMN design_models.default_labor_price_per_15g IS 'Giá ghi đè của mẫu; NULL kế thừa giá nhóm. Giữ nguyên mọi giá cũ, kể cả 0.';
-- Existing model prices and all transaction item prices are deliberately untouched.
COMMIT;
