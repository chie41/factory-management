# Monthly gold balances

Deploy migration `migrations/sql/20261025_customer_ledger_monthly_balances.sql` before starting the updated backend. For the local development database: `npm run ledger:migrate-snapshots`.

The Nest maintenance service processes at most 50 customers per minute, starts after the first minute, and starts a new pass one hour after completing the previous pass. It creates only completed months in Asia/Ho_Chi_Minh and rebuilds dirty months in chronological order. No external scheduler, queue or report-request backfill is required.

For immediate historical backfill/recalculation run `npm run ledger:snapshots`. To resume a pass: `npm run ledger:snapshots -- --after=<customer UUID>`. Rerunning from the beginning is safe; valid completed months are reused. Each batch commits separately.

Snapshots cache gold only (`numeric(30,4)`). Labor remains under the existing per-currency logic. The current ledger has no separate opening-balance field: its initial zero plus all legacy/imported transactions remains the source of truth.

The database trigger invalidates snapshots for both OLD and NEW customers/dates on ledger INSERT/UPDATE/DELETE, in the writer's transaction. Report SQL reads snapshots and ledger in one MVCC statement and never reads dirty snapshots. Rebuild batches serialize with an advisory lock and briefly take a SHARE table lock before reading inputs; writes wait until a batch commits. Lock wait is capped at 2 seconds and each maintenance statement at 30 seconds; failed batches roll back and retry without advancing the cursor.

`GET /customer-ledger/daily-gold?date=YYYY-MM-DD&scope=all|debt` requires only `customer_ledger.read`. The report uses business dates, includes pending gold under the shared ledger rules, preserves negative balances and supports future dates without creating snapshots. Only positive closing balances are retained by `scope=debt`.
