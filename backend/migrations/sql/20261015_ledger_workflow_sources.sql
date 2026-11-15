BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:ledger-schema'));
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_code varchar(50) NOT NULL UNIQUE,
 customer_id uuid NOT NULL REFERENCES customers(id), status varchar(40) NOT NULL DEFAULT 'PREPARING',
 labor_payment_status varchar(40) NOT NULL DEFAULT 'UNPAID' CHECK(labor_payment_status IN ('UNPAID','PARTIAL','PAID')),
 delivery_error boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz
);
CREATE SEQUENCE IF NOT EXISTS public.order_code_seq;
CREATE TABLE IF NOT EXISTS order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
 item_name varchar(180) NOT NULL, quantity integer NOT NULL CHECK(quantity>0),unit_weight_g numeric(20,4) NOT NULL CHECK(unit_weight_g>0),
 labor_price_per_15g numeric(20,4) NOT NULL CHECK(labor_price_per_15g>=0),
 line_labor_amount numeric(20,4) GENERATED ALWAYS AS (round(quantity::numeric*unit_weight_g*labor_price_per_15g/15,4)) STORED
);
CREATE TABLE IF NOT EXISTS delivery_trips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES employees(id),delivery_date date NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),note text
);
CREATE TABLE IF NOT EXISTS delivery_trip_orders (
 trip_id uuid NOT NULL REFERENCES delivery_trips(id),order_id uuid NOT NULL REFERENCES orders(id),PRIMARY KEY(trip_id,order_id)
);
CREATE TABLE IF NOT EXISTS delivery_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid REFERENCES delivery_trips(id),order_id uuid NOT NULL REFERENCES orders(id),
 event_type varchar(30) NOT NULL CHECK(event_type IN ('PICKED_UP','DELIVERED','FAILED','RESCHEDULED','APPROVED')),
 occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),actor_id uuid NOT NULL REFERENCES users(id),note text
);
CREATE OR REPLACE FUNCTION ledger_append_only_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Delivery event history is append-only' USING ERRCODE='23514'; END $$;
DROP TRIGGER IF EXISTS delivery_event_history_immutable ON delivery_events;
CREATE TRIGGER delivery_event_history_immutable BEFORE UPDATE OR DELETE ON delivery_events FOR EACH ROW EXECUTE FUNCTION ledger_append_only_event();
ALTER TABLE customers_ledger ADD COLUMN IF NOT EXISTS approval_status varchar(30) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE customers_ledger ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);
ALTER TABLE customers_ledger ADD COLUMN IF NOT EXISTS approved_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_order_delivery_once ON customers_ledger(reference_id) WHERE reference_type='ORDER_DELIVERY';
CREATE TABLE IF NOT EXISTS ledger_delivery_submissions (
 order_id uuid PRIMARY KEY REFERENCES orders(id),ledger_id uuid NOT NULL UNIQUE REFERENCES customers_ledger(id),trip_id uuid REFERENCES delivery_trips(id),
 original_labor_baht numeric(20,4) NOT NULL CHECK(original_labor_baht>=0),discount_type varchar(20) NOT NULL CHECK(discount_type IN ('NONE','PERCENT','AMOUNT')),
 discount_value numeric(20,4) NOT NULL CHECK(discount_value>=0),discount_baht numeric(20,4) NOT NULL CHECK(discount_baht>=0 AND discount_baht<=original_labor_baht),
 net_labor_baht numeric(20,4) NOT NULL CHECK(net_labor_baht=original_labor_baht-discount_baht),
 actual_received_amount numeric(20,4),received_currency char(3) CHECK(received_currency IN ('THB','LAK','VND')),
 declared_by uuid NOT NULL REFERENCES users(id),declared_at timestamptz NOT NULL DEFAULT now(),review_note text
);
CREATE TABLE IF NOT EXISTS cash_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code varchar(60) NOT NULL UNIQUE,name varchar(180) NOT NULL,direction varchar(3) NOT NULL CHECK(direction IN ('IN','OUT')),is_active boolean NOT NULL DEFAULT true
);
INSERT INTO cash_categories(code,name,direction) VALUES('CUSTOMER_LABOR_IN','Thu tiền công khách hàng','IN'),('CUSTOMER_LABOR_REFUND','Hoàn tiền công khách hàng','OUT') ON CONFLICT(code) DO NOTHING;
CREATE TABLE IF NOT EXISTS ledger_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ledger_id uuid NOT NULL REFERENCES customers_ledger(id),order_id uuid NOT NULL REFERENCES orders(id),
 request_id uuid NOT NULL UNIQUE,source varchar(20) NOT NULL CHECK(source IN ('DELIVERY','LEDGER','CASH')),
 amount numeric(20,4) NOT NULL CHECK(amount>0),currency char(3) NOT NULL CHECK(currency IN ('THB','LAK','VND')),
 confirmed_fx_per_baht numeric(20,4),paid_baht numeric(20,4),status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','VOID')),
 business_date date NOT NULL,occurred_at timestamptz NOT NULL,collected_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid REFERENCES users(id),approved_at timestamptz,
 CHECK(status<>'APPROVED' OR (confirmed_fx_per_baht>0 AND paid_baht>0 AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_initial_payment_once ON ledger_payments(order_id) WHERE source='DELIVERY' AND status<>'VOID';
CREATE TABLE IF NOT EXISTS ledger_fx_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_id uuid NOT NULL REFERENCES ledger_payments(id),old_fx numeric(20,4),new_fx numeric(20,4) NOT NULL CHECK(new_fx>0),
 old_paid_baht numeric(20,4),new_paid_baht numeric(20,4) NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cash_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),direction varchar(3) NOT NULL CHECK(direction IN ('IN','OUT')),category_id uuid NOT NULL REFERENCES cash_categories(id),
 amount numeric(20,4) NOT NULL CHECK(amount>0),currency char(3) NOT NULL CHECK(currency IN ('THB','LAK','VND')),customer_id uuid NOT NULL REFERENCES customers(id),
 employee_id uuid REFERENCES employees(id),business_date date NOT NULL,occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),
 payment_id uuid UNIQUE REFERENCES ledger_payments(id),refund_id uuid UNIQUE,reference_type varchar(50) NOT NULL,reference_id uuid NOT NULL,
 CHECK((direction='IN' AND payment_id IS NOT NULL AND refund_id IS NULL) OR (direction='OUT' AND refund_id IS NOT NULL AND payment_id IS NULL))
);
CREATE TABLE IF NOT EXISTS cash_report_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(120) NOT NULL,from_date date NOT NULL,to_date date NOT NULL CHECK(to_date>=from_date),
 kip_per_baht numeric(20,4) CHECK(kip_per_baht>0),vnd_per_baht numeric(20,4) CHECK(vnd_per_baht>0),closed_at timestamptz,closed_by uuid REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS ledger_goods_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL UNIQUE,order_id uuid NOT NULL REFERENCES orders(id),ledger_id uuid UNIQUE REFERENCES customers_ledger(id),
 source_ledger_id uuid NOT NULL REFERENCES customers_ledger(id),status varchar(20) NOT NULL DEFAULT 'PENDING',
 business_date date NOT NULL,occurred_at timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid REFERENCES users(id),approved_at timestamptz,note text
);
CREATE TABLE IF NOT EXISTS ledger_goods_return_items (
 return_id uuid NOT NULL REFERENCES ledger_goods_returns(id),order_item_id uuid NOT NULL REFERENCES order_items(id),quantity integer NOT NULL CHECK(quantity>0),
 gold_weight_g numeric(20,4) NOT NULL CHECK(gold_weight_g>0),net_labor_baht numeric(20,4) NOT NULL CHECK(net_labor_baht>=0),
 PRIMARY KEY(return_id,order_item_id)
);
CREATE TABLE IF NOT EXISTS ledger_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),return_id uuid NOT NULL UNIQUE REFERENCES ledger_goods_returns(id),
 amount_baht numeric(20,4) NOT NULL CHECK(amount_baht>0),amount numeric(20,4) NOT NULL CHECK(amount>0),currency char(3) NOT NULL CHECK(currency IN ('THB','LAK','VND')),
 confirmed_fx_per_baht numeric(20,4) NOT NULL CHECK(confirmed_fx_per_baht>0),approved_by uuid NOT NULL REFERENCES users(id),approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cash_transactions DROP CONSTRAINT IF EXISTS cash_transactions_refund_fk;
ALTER TABLE cash_transactions ADD CONSTRAINT cash_transactions_refund_fk FOREIGN KEY(refund_id) REFERENCES ledger_refunds(id);
INSERT INTO security_audit(target_id,action,before_state,after_state)
 SELECT id,'ledger.correct_legacy_baht_label',jsonb_build_object('labor_currency',labor_currency,'labor_amount_due',labor_amount_due,'labor_amount_paid',labor_amount_paid),jsonb_build_object('labor_currency','THB','reason','Owner confirmed legacy VND labels were incorrect; amounts are BAHT')
 FROM customers_ledger WHERE labor_currency='VND';
UPDATE customers_ledger SET labor_currency='THB' WHERE labor_currency='VND';
CREATE TABLE IF NOT EXISTS order_split_links (
 source_order_id uuid NOT NULL REFERENCES orders(id),new_order_id uuid NOT NULL UNIQUE REFERENCES orders(id),split_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_order_id,new_order_id)
);
DROP TRIGGER IF EXISTS cash_posted_immutable ON cash_transactions;
CREATE TRIGGER cash_posted_immutable BEFORE UPDATE OR DELETE ON cash_transactions FOR EACH ROW EXECUTE FUNCTION ledger_append_only_event();
COMMIT;
