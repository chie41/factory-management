BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:ledger-schema'));
ALTER TABLE customers_ledger ADD COLUMN IF NOT EXISTS actual_weight_g numeric(20,4);
ALTER TABLE customers_ledger ADD COLUMN IF NOT EXISTS purity_percent numeric(7,4);
ALTER TABLE customers_ledger ADD COLUMN IF NOT EXISTS recovered_exact_gold_g numeric(30,10);
ALTER TABLE customers_ledger ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
ALTER TABLE customers_ledger ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS customers_ledger_request_unique ON customers_ledger(request_id) WHERE request_id IS NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ledger_recovered_inputs_valid') THEN
  ALTER TABLE customers_ledger ADD CONSTRAINT ledger_recovered_inputs_valid CHECK (
   (actual_weight_g IS NULL AND purity_percent IS NULL AND recovered_exact_gold_g IS NULL) OR
   (transaction_type='RETURN_RECOVERED_GOLD' AND actual_weight_g IS NOT NULL AND actual_weight_g>0 AND purity_percent IS NOT NULL AND purity_percent>0 AND purity_percent<=100 AND recovered_exact_gold_g IS NOT NULL AND recovered_exact_gold_g=actual_weight_g*purity_percent/100 AND gold_weight_g=round(recovered_exact_gold_g,4))
  );
 END IF;
END $$;
COMMIT;
