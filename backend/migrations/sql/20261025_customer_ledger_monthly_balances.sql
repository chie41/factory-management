BEGIN;
CREATE TABLE customer_ledger_monthly_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  period date NOT NULL CHECK (extract(day FROM period)=1),
  closing_gold_g numeric(30,4) NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  is_dirty boolean NOT NULL DEFAULT false,
  UNIQUE(customer_id,period)
);
CREATE INDEX customer_ledger_monthly_valid_idx ON customer_ledger_monthly_balances(customer_id,period DESC) WHERE NOT is_dirty;
CREATE INDEX customers_ledger_customer_business_idx ON customers_ledger(customer_id,business_date);
-- Every writer (ORM, workflow, manual SQL) invalidates in the same transaction.
CREATE FUNCTION invalidate_customer_ledger_monthly_balances() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE customer_ledger_monthly_balances SET is_dirty=true
      WHERE customer_id=OLD.customer_id AND period>=date_trunc('month',OLD.business_date)::date AND NOT is_dirty;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE customer_ledger_monthly_balances SET is_dirty=true
      WHERE customer_id=NEW.customer_id AND period>=date_trunc('month',NEW.business_date)::date AND NOT is_dirty;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER customer_ledger_monthly_invalidation AFTER INSERT OR UPDATE OR DELETE ON customers_ledger
  FOR EACH ROW EXECUTE FUNCTION invalidate_customer_ledger_monthly_balances();
-- Defense in depth: a monthly cache is never a current/future-month closing.
CREATE FUNCTION guard_customer_ledger_monthly_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period>=date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'Monthly snapshots require a completed month';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_ledger_monthly_period_guard BEFORE INSERT OR UPDATE ON customer_ledger_monthly_balances
  FOR EACH ROW EXECUTE FUNCTION guard_customer_ledger_monthly_period();
COMMIT;
