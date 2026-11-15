BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:rbac'));
CREATE SEQUENCE IF NOT EXISTS public.group_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.role_code_seq;
SELECT setval('public.group_code_seq',GREATEST((SELECT last_value FROM public.group_code_seq),COALESCE((SELECT MAX(substring(code from 3)::bigint)+1 FROM groups WHERE code ~ '^NQ[0-9]+$'),1)),false);
SELECT setval('public.role_code_seq',GREATEST((SELECT last_value FROM public.role_code_seq),COALESCE((SELECT MAX(substring(code from 3)::bigint)+1 FROM roles WHERE code ~ '^VT[0-9]+$'),1)),false);
COMMIT;
