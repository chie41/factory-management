BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:ledger-schema'));
-- Extend source tracing to existing backend transaction types. No business rows are changed.
ALTER TABLE public.ledger_excel_import_sources
 DROP CONSTRAINT ledger_excel_import_sources_kind_check,
 ADD CONSTRAINT ledger_excel_import_sources_kind_check
 CHECK(kind IN ('DELIVERY','RETURN_GOLD','GOLD_RETURN_TO_CUSTOMER','RETURN_RECOVERED_GOLD','RETURN_GOODS','PAYMENT'));
COMMIT;
