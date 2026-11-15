BEGIN;
ALTER TABLE ledger_goods_returns ADD COLUMN transaction_employee_id uuid REFERENCES employees(id);
COMMIT;
