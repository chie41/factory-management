BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:ledger-schema'));
CREATE TABLE public.ledger_excel_import_batches (
 request_id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES public.users(id),
 intent_hash text NOT NULL,
 file_sha text NOT NULL,
 file_name text NOT NULL,
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ledger_excel_import_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.ledger_excel_import_batches(request_id),
 file_sha text NOT NULL,
 sheet text NOT NULL,
 source_rows integer[] NOT NULL,
 customer_id uuid NOT NULL REFERENCES public.customers(id),
 kind text NOT NULL CHECK(kind IN ('DELIVERY','RETURN_GOLD','PAYMENT')),
 content_hash text NOT NULL,
 target_id uuid NOT NULL,
 source_data jsonb NOT NULL,
 UNIQUE(file_sha,sheet,source_rows,customer_id,kind)
);
CREATE INDEX ledger_excel_import_source_file ON public.ledger_excel_import_sources(file_sha,sheet,customer_id,kind);
CREATE INDEX ledger_excel_import_source_content ON public.ledger_excel_import_sources(customer_id,content_hash);
COMMIT;
