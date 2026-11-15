BEGIN;
ALTER TABLE order_items ADD COLUMN superseded_at timestamptz;
CREATE INDEX order_items_active_ledger_idx ON order_items(ledger_id) WHERE superseded_at IS NULL;
COMMIT;
