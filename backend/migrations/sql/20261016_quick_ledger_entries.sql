BEGIN;
ALTER TABLE order_items ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE order_items ADD COLUMN ledger_id uuid REFERENCES customers_ledger(id);
ALTER TABLE order_items ADD CONSTRAINT order_item_single_source CHECK ((order_id IS NULL) <> (ledger_id IS NULL));
CREATE INDEX order_items_ledger_idx ON order_items(ledger_id);
ALTER TABLE ledger_goods_returns ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE customers_ledger ADD COLUMN transaction_employee_id uuid REFERENCES employees(id);
ALTER TABLE ledger_payments ADD COLUMN collected_employee_id uuid REFERENCES employees(id);
ALTER TABLE ledger_payments ADD COLUMN note text;
CREATE TABLE ledger_entry_batches (
 request_id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id),
 intent_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
