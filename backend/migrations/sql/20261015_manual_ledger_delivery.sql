BEGIN;
ALTER TABLE ledger_delivery_submissions ADD CONSTRAINT ledger_delivery_submissions_order_unique UNIQUE(order_id);
ALTER TABLE ledger_delivery_submissions DROP CONSTRAINT ledger_delivery_submissions_pkey;
ALTER TABLE ledger_delivery_submissions ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE ledger_delivery_submissions ADD PRIMARY KEY(ledger_id);
ALTER TABLE ledger_payments ALTER COLUMN order_id DROP NOT NULL;
CREATE UNIQUE INDEX manual_delivery_initial_payment_once ON ledger_payments(ledger_id) WHERE source='DELIVERY' AND status<>'VOID';
COMMIT;
