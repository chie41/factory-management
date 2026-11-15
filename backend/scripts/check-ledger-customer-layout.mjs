import 'dotenv/config';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { LedgerLayoutService } from '../dist/customer-ledger/ledger-layout.service.js';
import { CustomerLedgerService } from '../dist/customer-ledger/customer-ledger.service.js';
import { MonthlyBalanceService } from '../dist/customer-ledger/monthly-balance.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { QueryLedgerDto } from '../dist/customer-ledger/dto/query-ledger.dto.js';
const url = new URL(process.env.DATABASE_URL);
if (!process.argv.includes('--local') || process.env.NODE_ENV !== 'development' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('Development localhost only; pass --local');
const c = new Client({connectionString:url.toString()});
await c.connect();
const businessFingerprint = async () => (await c.query(`SELECT md5(coalesce(string_agg(md5(row_to_json(l)::text),'' ORDER BY l.id),'')) hash,count(*)::text count FROM public.customers_ledger l`)).rows[0];
let checks = 0;
try {
 const before = await businessFingerprint();
 const stored = (await c.query('SELECT revision::text,items FROM public.ledger_customer_layout WHERE id=true')).rows;
 await c.query('BEGIN');
 // Savepoints exercise the real service without persisting test layout changes.
 const query = (sql,params) => c.query(sql==='BEGIN'?'SAVEPOINT layout_test':sql==='COMMIT'?'RELEASE SAVEPOINT layout_test':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT layout_test':sql,params);
 const rbac = {pool:{query,connect:async()=>({query,release(){}})}};
 const layout = new LedgerLayoutService(rbac);
 const summaryService = new CustomerLedgerService(new PrismaService(),rbac,layout);
 const params = Object.assign(new QueryLedgerDto(),{customer_scope:'all',page_size:100});
 const dailyService = new MonthlyBalanceService(rbac);
 const reportDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
 const dailyBaseline = (await dailyService.daily(reportDate,'all')).data;
 const initial = await layout.read();
 const baseline = await summaryService.summary(params); checks++;
 assert.equal(baseline.meta.total,initial.items.filter(i=>i.is_visible_in_ledger).length);
 if(initial.items.length){
  const reordered = [...initial.items].reverse().map(({id,is_visible_in_ledger})=>({id,is_visible_in_ledger:true}));
  await layout.save({revision:initial.revision,items:reordered});
  const refreshed = await layout.read();
  const dailySorted = (await dailyService.daily(reportDate,'all')).data;
  const eligible = new Set(dailyBaseline.rows.map(r=>r.customer_id));
  assert.deepEqual(dailySorted.rows.map(r=>r.customer_id),reordered.map(i=>i.id).filter(id=>eligible.has(id)));
  assert.deepEqual(dailySorted.totals,dailyBaseline.totals);
  const byId = rows => [...rows].sort((a,b)=>a.customer_id.localeCompare(b.customer_id));
  assert.deepEqual(byId(dailySorted.rows),byId(dailyBaseline.rows)); checks++;
  const debtReport = (await dailyService.daily(reportDate,'debt')).data;
  const debtIds = new Set(debtReport.rows.map(r=>r.customer_id));
  assert.deepEqual(debtReport.rows.map(r=>r.customer_id),reordered.map(i=>i.id).filter(id=>debtIds.has(id))); checks++;
  assert.deepEqual(refreshed.items.map(i=>i.id),reordered.map(i=>i.id)); checks++;
  assert.equal((await summaryService.summary(params)).data[0].customer.id,reordered[0].id); checks++;
  const hide = reordered.map((i,index)=>({...i,is_visible_in_ledger:index!==0}));
  await layout.save({revision:refreshed.revision,items:hide});
  const hidden = await summaryService.summary(params);
  assert.equal(hidden.meta.total,initial.items.length-1);
  assert.deepEqual(hidden.statistics,baseline.statistics); checks++;
  const hiddenState = await layout.read();
  await layout.save({revision:hiddenState.revision,items:reordered});
  assert.equal((await layout.read()).items[0].is_visible_in_ledger,true); checks++;
  // Missing a customer's configuration is equivalent to a newly added customer.
  await c.query('UPDATE public.ledger_customer_layout SET items=$1::jsonb WHERE id=true',[JSON.stringify(reordered.slice(1))]);
  const newCustomer = await layout.read();
  assert.equal(newCustomer.items.at(-1).id,reordered[0].id);
  assert.equal(newCustomer.items.at(-1).is_visible_in_ledger,true); checks++;
 }
 await c.query("UPDATE public.ledger_customer_layout SET items='[]'::jsonb WHERE id=true");
 const emptyConfig = await layout.read();
 assert.equal(emptyConfig.items.length,initial.items.length);
 assert.ok(emptyConfig.items.every(i=>i.is_visible_in_ledger)); checks++;
 assert.equal((await summaryService.summary(params)).meta.total,initial.items.length); checks++;
 const dailyDefault = (await dailyService.daily(reportDate,'all')).data;
 const eligibleDefault = new Set(dailyDefault.rows.map(r=>r.customer_id));
 assert.deepEqual(dailyDefault.rows.map(r=>r.customer_id),emptyConfig.items.map(i=>i.id).filter(id=>eligibleDefault.has(id)));
 assert.deepEqual(dailyDefault.totals,dailyBaseline.totals); checks++;
 await c.query('ROLLBACK');
 assert.deepEqual((await c.query('SELECT revision::text,items FROM public.ledger_customer_layout WHERE id=true')).rows,stored); checks++;
 assert.deepEqual(await businessFingerprint(),before); checks++;
 console.log(JSON.stringify({checks,customers:initial.items.length,ledger_rows:before.count,layout_test_changes:'rolled back',business_rows:'unchanged'}));
} catch(error) { await c.query('ROLLBACK'); throw error; }
finally { await c.end(); }
// Prisma runtime owns a lazy pool; terminate after explicit verification and cleanup.
process.exit(0);
