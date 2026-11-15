import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { Client } from 'pg';
import { RbacService } from '../dist/auth/rbac.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { CustomersService } from '../dist/customers/customers.service.js';
import { LaborPricingService } from '../dist/catalog/labor-pricing.service.js';
import { QuickEntryService } from '../dist/customer-ledger/workflow/quick-entry.service.js';
import { LedgerWorkflowService } from '../dist/customer-ledger/workflow/ledger-workflow.service.js';
import { ExcelImportService } from '../dist/customer-ledger/excel-import/excel-import.service.js';
import { HEADERS } from '../dist/customer-ledger/excel-import/excel-parser.js';
const url=new URL(process.env.DATABASE_URL);
if(!process.argv.includes('--local')||process.env.NODE_ENV!=='development'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Development localhost only; pass --local');
const c=new Client({connectionString:url.toString()});await c.connect();
const originalRbac=new RbacService();
const tables=['customers','customers_ledger','order_items','ledger_payments','ledger_delivery_submissions','ledger_excel_import_batches','ledger_excel_import_sources','security_audit','customer_ledger_monthly_balances','cash_transactions'];
async function fingerprint(){const out={};for(const table of tables)out[table]=(await c.query(`SELECT md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) hash,count(*)::text count FROM public.${table} t`)).rows[0];return out;}
let checks=0;
try {
 const before=await fingerprint();
 await c.query('BEGIN');
 // A service COMMIT releases only its savepoint; the outer test transaction always rolls back.
 const query=(sql,params)=>c.query(sql==='BEGIN'?'SAVEPOINT excel_service':sql==='COMMIT'?'RELEASE SAVEPOINT excel_service':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT excel_service':sql,params);
 const client={query,release(){}};
 const rbac=Object.create(originalRbac);Object.defineProperty(rbac,'pool',{value:{query,connect:async()=>client}});
 const workflow=new LedgerWorkflowService(rbac);const quick=new QuickEntryService(rbac,workflow,new LaborPricingService(rbac));
 // A test-only unique customer code avoids consuming the live sequence; all inserted rows roll back.
 const customers=new CustomersService(new PrismaService(),{next:async()=>`KH_TEST_${randomUUID().slice(0,8)}`},rbac);
 const service=new ExcelImportService(rbac,quick,workflow,customers);
 let actor;
 for(const row of (await c.query("SELECT id FROM users WHERE status='ACTIVE' AND deleted_at IS NULL")).rows){const permissions=await rbac.effective(row.id,client);if(['customer_ledger.create','customer_ledger.collect','customers.create'].every(code=>permissions.some(p=>p.code===code))){actor=row.id;break;}}
 assert.ok(actor,'Need an existing account with ledger create/collect and customer create');
 const employee=(await quick.eligibleEmployees(client))[0];assert.ok(employee,'Need eligible transaction employee');
 const model=(await c.query("SELECT id,code,name FROM design_models WHERE status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert.ok(model,'Need active design model');
 const customer=(await c.query('SELECT id,name FROM customers WHERE deleted_at IS NULL ORDER BY id LIMIT 1')).rows[0];assert.ok(customer,'Need an existing customer');
 const wb=new ExcelJS.Workbook();const sheet=wb.addWorksheet('Giao dịch');sheet.addRow(HEADERS);
 sheet.addRow(['01/10/2026',employee.name,'','5','30','',model.code,1,15,15,10,10,20,'03/10/2026',5,employee.name,'Import test']);
 sheet.addRow(['','','','','','',model.code,1,15,15,10,10]);
 const input={file_base64:Buffer.from(await wb.xlsx.writeBuffer()).toString('base64'),file_name:'synthetic-import-test.xlsx',bulk:false,customer_id:customer.id};
 const preview=(await service.preview(input,actor)).data;
 assert.equal(preview.groups.length,3);assert.ok(preview.groups.every(g=>g.errors.length===0));checks++;
 assert.deepEqual(await fingerprint(),before);checks++;
 const selections=preview.groups.map(g=>({group_id:g.id,employee_id:employee.id,collector_id:employee.id,models:g.lines.map(l=>({row:l.row,model_id:model.id})),payment_target_group:g.parent,confirmed_review:true,allow_possible_duplicate:true}));
 const dto={...input,currency:'THB',request_id:randomUUID(),selections};
 const result=(await service.confirm(dto,actor)).data;assert.equal(result.entries.length,3);checks++;
 const delivery=result.entries.find(g=>g.kind==='DELIVERY');const received=result.entries.find(g=>g.kind==='RETURN_GOLD');const payment=result.entries.find(g=>g.kind==='PAYMENT');
 const saved=(await c.query('SELECT * FROM customers_ledger WHERE id=$1',[delivery.id])).rows[0];
 assert.equal(saved.gold_weight_g,'30.0000');assert.equal(saved.labor_amount_due,'20.0000');checks++;
 assert.equal((await c.query('SELECT * FROM order_items WHERE ledger_id=$1',[delivery.id])).rowCount,2);checks++;
 assert.equal((await c.query('SELECT transaction_type FROM customers_ledger WHERE id=$1',[received.id])).rows[0].transaction_type,'RETURN_GOLD');checks++;
 const receipt=(await c.query('SELECT business_date::text date,status,amount,collected_employee_id FROM ledger_payments WHERE id=$1',[payment.id])).rows[0];
 assert.deepEqual(receipt,{date:'2026-10-03',status:'PENDING',amount:'5.0000',collected_employee_id:employee.id});checks++;
 const count=(await c.query('SELECT count(*)::text count FROM customers_ledger')).rows[0].count;
 assert.deepEqual((await service.confirm(dto,actor)).data,result);assert.equal((await c.query('SELECT count(*)::text count FROM customers_ledger')).rows[0].count,count);checks++;
 await assert.rejects(()=>service.confirm({...dto,request_id:randomUUID()},actor),/dòng nguồn đã import/);checks++;
 const bulk=new ExcelJS.Workbook();const sh=bulk.addWorksheet('Giao dịch');const headers=[...HEADERS];headers.splice(1,0,'KHÁCH HÀNG');sh.addRow(headers);
 const name=`Khách import thử ${randomUUID()}`;sh.addRow(['02/10/2026',name,employee.name,'','2','','','','','','','','','','','','','']);
 const bulkInput={file_base64:Buffer.from(await bulk.xlsx.writeBuffer()).toString('base64'),file_name:'bulk-test.xlsx',bulk:true};
 const bulkPreview=(await service.preview(bulkInput,actor)).data;assert.equal(bulkPreview.groups[0].customer_id,undefined);assert.equal((await c.query('SELECT id FROM customers WHERE name=$1',[name])).rowCount,0);checks++;
 const bulkResult=(await service.confirm({...bulkInput,request_id:randomUUID(),currency:'THB',selections:[{group_id:bulkPreview.groups[0].id,new_customer_name:name,employee_id:employee.id,confirmed_review:true}]},actor)).data;
 assert.equal(bulkResult.entries.length,1);assert.equal((await c.query('SELECT id FROM customers WHERE name=$1',[name])).rowCount,1);checks++;
 await c.query('ROLLBACK');assert.deepEqual(await fingerprint(),before);checks++;
 console.log(JSON.stringify({checks,preview:'no writes',grouped_delivery_lines:2,separate_payment_date:receipt.date,payment_status:receipt.status,idempotency:'passed',duplicate_source:'rejected',unknown_customer:'created only at confirmation',all_test_changes:'rolled back',business_fingerprints:'unchanged'}));
}catch(error){await c.query('ROLLBACK');throw error;}
finally{await c.end();await originalRbac.pool.end();}
process.exit(0);
