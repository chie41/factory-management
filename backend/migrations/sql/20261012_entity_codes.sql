-- Apply once during deployment, before starting the new application.
-- Lock writes while initializing; include soft-deleted rows. Never reset sequences.
BEGIN;
LOCK TABLE public.customers, public.employees IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS public.customer_code_seq AS bigint MINVALUE 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.employee_code_seq AS bigint MINVALUE 1 NO CYCLE;
SELECT setval('public.customer_code_seq', GREATEST(
  (SELECT last_value FROM public.customer_code_seq),
  COALESCE((SELECT max(substring(customer_code FROM '^KH([0-9]+)$')::bigint) FROM public.customers), 0), 1
), (SELECT is_called FROM public.customer_code_seq) OR EXISTS (SELECT 1 FROM public.customers WHERE customer_code ~ '^KH[0-9]+$'));
SELECT setval('public.employee_code_seq', GREATEST(
  (SELECT last_value FROM public.employee_code_seq),
  COALESCE((SELECT max(substring(employee_code FROM '^NV([0-9]+)$')::bigint) FROM public.employees), 0), 1
), (SELECT is_called FROM public.employee_code_seq) OR EXISTS (SELECT 1 FROM public.employees WHERE employee_code ~ '^NV[0-9]+$'));
-- Existing Prisma @unique constraints cover deleted rows too. Ensure this for older DBs.
CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_all_unique ON public.customers(customer_code);
CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_all_unique ON public.employees(employee_code);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone varchar(30);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS start_date date;
-- Codes are immutable even if a future service accidentally includes them in an UPDATE.
CREATE OR REPLACE FUNCTION public.protect_entity_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_TABLE_NAME = 'customers' AND to_jsonb(NEW)->>'customer_code' IS DISTINCT FROM to_jsonb(OLD)->>'customer_code')
    OR (TG_TABLE_NAME = 'employees' AND to_jsonb(NEW)->>'employee_code' IS DISTINCT FROM to_jsonb(OLD)->>'employee_code') THEN
    RAISE EXCEPTION 'Entity codes are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS customer_code_immutable ON public.customers;
CREATE TRIGGER customer_code_immutable BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.protect_entity_code();
DROP TRIGGER IF EXISTS employee_code_immutable ON public.employees;
CREATE TRIGGER employee_code_immutable BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.protect_entity_code();
COMMIT;
