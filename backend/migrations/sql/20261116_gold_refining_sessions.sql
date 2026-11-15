BEGIN;

-- Every business day has at most one reconciliation session. No demo data is inserted.
CREATE TABLE public.gold_refining_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','FINALIZED','LOCKED','REOPENED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_work_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  manual_entries jsonb NOT NULL DEFAULT '{}'::jsonb,
  layout_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals_snapshot jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  finalized_by uuid REFERENCES users(id),
  reopened_by uuid REFERENCES users(id),
  finalized_at timestamptz,
  locked_at timestamptz,
  lock_after_hours integer NOT NULL DEFAULT 24 CHECK (lock_after_hours BETWEEN 0 AND 168),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX gold_refining_sessions_date_desc_idx
  ON public.gold_refining_sessions(business_date DESC);

CREATE TABLE public.gold_refining_layout_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from date NOT NULL UNIQUE,
  template jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.gold_refining_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.gold_refining_sessions(id),
  action text NOT NULL CHECK (action IN
    ('CREATE','UPDATE','RELOAD','FINALIZE','LOCK','REOPEN','LAYOUT')),
  actor_id uuid NOT NULL REFERENCES users(id),
  before_version integer,
  after_version integer NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX gold_refining_events_session_time_idx
  ON public.gold_refining_session_events(session_id,created_at DESC);

COMMIT;
