import 'dotenv/config';
import { RbacService } from '../src/auth/rbac.service.js';
import { MonthlyBalanceService } from '../src/customer-ledger/monthly-balance.service.js';
// Run again after month-end or historical corrections. Completed batches persist.
// Optional --after=<last customer UUID> resumes an interrupted pass.
const rbac = new RbacService();
try {
  const service = new MonthlyBalanceService(rbac);
  let cursor = process.argv.find(a=>a.startsWith('--after='))?.slice(8);
  for (;;) {
    const result = await service.rebuildBatch(cursor);
    console.log(JSON.stringify(result));
    if (!result.cursor) break;
    cursor = result.cursor;
  }
} finally { await rbac.onModuleDestroy(); }
