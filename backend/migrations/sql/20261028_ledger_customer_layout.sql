BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:ledger-schema'));
CREATE TABLE IF NOT EXISTS ledger_customer_layout (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 revision bigint NOT NULL DEFAULT 0,
 items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items)='array')
);
-- Preserve the legacy un-ordered customer scan on initial setup.
INSERT INTO ledger_customer_layout(id,items)
SELECT true,coalesce(jsonb_agg(jsonb_build_object('id',id,'is_visible_in_ledger',true)),'[]'::jsonb)
FROM customers WHERE deleted_at IS NULL ON CONFLICT DO NOTHING;
COMMIT;
