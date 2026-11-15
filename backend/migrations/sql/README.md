# Server-owned customer and employee codes

## Production v2.0

`20261029_production_v2.sql` bổ sung thời lượng, planned timestamps, trọng lượng snapshot, lịch sử giao thêm việc và đối soát Hao/Heo. Runner `node scripts/migrate-production-v2.mjs --local` sau các migration production Phase 01–03. Đã áp dụng localhost; không reset/seed hoặc áp dụng production. Xem [báo cáo v2 và giới hạn nghiệp vụ](../../docs/production-module-v2.md).

## Production execution — Phase 03

`20261029_production_execution.sql` bổ sung trạng thái/sản lượng công đoạn, phân công, giao nhận, hao hụt, tiền công và idempotency ledger. Chạy `node scripts/migrate-production-execution.mjs --local` sau migration Phase 02. Đã áp dụng localhost, không reset/seed hoặc áp dụng production. Xem [API, AND-Join, guard và các nghiệp vụ chưa chốt](../../docs/production-execution-phase03.md).

## Production batches — Phase 02

Migration `20261029_production_batches.sql` bổ sung lô, snapshot revision, công đoạn/dependency, history/audit và trigger bảo vệ lịch sử. Runner: `node scripts/migrate-production-batches.mjs --local`. Đã áp dụng localhost; không reset/seed hoặc áp dụng production. Xem [báo cáo, API và các quy tắc chưa chốt](../../docs/production-batches-phase02.md).

## Production workflows — 29/10/2026

Phase 01 dùng migration bổ sung `20261029_production_workflows.sql` và runner `node scripts/migrate-production-workflows.mjs --local`. Đã áp dụng localhost; không reset hoặc seed. Production cần áp dụng migration qua deployment process trước khi chạy backend mới. Prisma contract đã cập nhật và emit lại. Xem [API, UI, concurrency và báo cáo Phase 01](../../docs/production-workflows-phase01.md).

`20261012_entity_codes.sql` uses independent PostgreSQL bigint sequences (`KH` / `NV`, at least six digits). Existing codes remain unchanged. Initialization takes an exclusive table lock and scans all numeric codes, including soft-deleted records. `nextval` is atomic across application processes, and consumed values are not rolled back or reused. Gaps are expected. Unique indexes cover all records, and triggers prevent code updates.

This is explicit SQL because this repository uses Prisma 8 RC contract snapshots rather than Prisma 7 migration folders. Keep this SQL in the deployment migration process alongside contract snapshots. It adds optional employee phone/start-date columns to match the existing frontend/API fields. The application allocates codes through EntityCodeService and still writes entities through the existing Prisma ORM. Both Create/Update DTOs exclude all code fields; the global validation pipe rejects extra fields with HTTP 400.

Local development, from `backend`:

```powershell
node scripts/migrate-entity-codes.mjs --local
npm run contract:emit
npm run build
npm run start:dev
```

The local runner checks localhost and rejects NODE_ENV=production, tracks a checksum, and applies the SQL atomically under a migration lock. No production migration was run. For deployment, apply the SQL once before starting the new backend using the normal deployment database role. The runtime role needs USAGE/SELECT on both sequences; configure grants if migrations and runtime use different roles.

Employee endpoints require existing `employees.read`, `employees.create`, `employees.update` permissions. Provision permissions and role assignments through the existing authorization process; this change does not silently grant access. Work/payroll/supplies/activity endpoints remain outside this change.

Verification:

```powershell
$env:TEST_ENTITY_CODES_DB='1'
npx vitest run src/prisma/entity-code.spec.ts
```

Integration verification uses a disposable schema on localhost, never application tables, and cleans it up. It checks legacy/deleted codes, 120 concurrent allocations/inserts, unique constraints, immutable codes, monotonic migration reruns and consumed failed allocations. DTO tests cover all client code spellings. Removing a deployed migration must never reset sequences or change existing codes.
