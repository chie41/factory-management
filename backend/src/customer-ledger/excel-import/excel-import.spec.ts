import { describe, expect, it, vi } from 'vitest';
import { ExcelImportService } from './excel-import.service.js';
import type { RbacService } from '../../auth/rbac.service.js';
import type { QuickEntryService } from '../workflow/quick-entry.service.js';
import type { LedgerWorkflowService } from '../workflow/ledger-workflow.service.js';
import type { CustomersService } from '../../customers/customers.service.js';
import type { ConfirmExcelDto } from './excel-import.dto.js';
const customer='11111111-1111-4111-8111-111111111111';
const employee='22222222-2222-4222-8222-222222222222';
const model='33333333-3333-4333-8333-333333333333';
const request='44444444-4444-4444-8444-444444444444';
const group={id:'Sổ:2:DELIVERY',sheet:'Sổ',rows:[2,3],kind:'DELIVERY',customer:'Khách chưa có',date:'2026-10-01',employee:'A',gold:'30.0000',labor:'20.0000',lines:[{row:2,name:'Mẫu',quantity:2,unit_weight_g:'15.0000',price:'10.0000'}],errors:[],warnings:[],note:'',content_hash:'group'};
const dto=():ConfirmExcelDto=>({file_base64:'fake',file_name:'test.xlsx',bulk:true,currency:'THB',request_id:request,selections:[{group_id:group.id,customer_id:customer,employee_id:employee,models:[{row:2,model_id:model}],confirmed_review:true}]});
function fixture(options:{duplicate?:boolean;similar?:boolean;fail?:boolean;denyCreate?:boolean}={}) {
 const query=vi.fn(async(sql:string)=>{
  if(sql.startsWith('SELECT id FROM customers WHERE'))return {rows:[{id:customer}],rowCount:1};
  if(sql.startsWith('SELECT id FROM ledger_excel_import_sources WHERE file_sha'))return {rows:[],rowCount:options.duplicate?1:0};
  if(sql.startsWith('SELECT id FROM customers_ledger WHERE customer_id'))return {rows:[],rowCount:options.similar?1:0};
  return {rows:[],rowCount:0};
 });
 const release=vi.fn();const client={query,release};
 const requirePermission=vi.fn(async(_actor:string,permissions:string[])=>{if(options.denyCreate&&permissions.includes('customers.create'))throw Error('Forbidden')});
 const quick={save:vi.fn(async()=>{if(options.fail)throw Error('invalid item');return {data:{entries:[{id:'created',approval_status:'APPROVED'}]}}})};
 const customers={create:vi.fn(async()=>({data:{id:customer}}))};
 const service=new ExcelImportService({pool:{connect:async()=>client},require:requirePermission} as unknown as RbacService,quick as unknown as QuickEntryService,{} as LedgerWorkflowService,customers as unknown as CustomersService);
 const prepared={file_sha:'file',sheets:[{name:'Sổ',rows:[{row:2,cells:['original']},{row:3,cells:['detail']}]}],groups:[group],customers:[],employees:[{id:employee}],models:[{id:model}],deliveries:[],ignored:[]};
 // Parsing and workbook reading are covered independently; these tests focus on transaction boundaries and policy.
 vi.spyOn(service as unknown as {prepare:()=>Promise<unknown>},'prepare').mockResolvedValue(prepared);
 return {service,query,quick,customers,requirePermission,release,client};
}
describe('Excel confirmation is explicit, atomic and idempotent',()=>{
 it('does not write customers or business data during preview',async()=>{
  const f=fixture();await f.service.preview(dto(),'actor');
  expect(f.query).not.toHaveBeenCalled();expect(f.quick.save).not.toHaveBeenCalled();expect(f.customers.create).not.toHaveBeenCalled();
 });
 it('passes the same transaction to customer creation and quick entry writing',async()=>{
  const f=fixture();const input=dto();delete input.selections[0].customer_id;input.selections[0].new_customer_name='Khách mới';
  await f.service.confirm(input,'actor');
  expect(f.customers.create).toHaveBeenCalledWith({name:'Khách mới'},'actor',f.client);
  expect(f.quick.save.mock.calls[0].at(-1)).toBe(f.client);
  expect(f.query).toHaveBeenLastCalledWith('COMMIT');expect(f.release).toHaveBeenCalled();
 });
 it('does not create an unmatched customer automatically',async()=>{
  const f=fixture();const input=dto();delete input.selections[0].customer_id;
  await expect(f.service.confirm(input,'actor')).rejects.toThrow('chọn khách');
  expect(f.customers.create).not.toHaveBeenCalled();expect(f.query).toHaveBeenLastCalledWith('ROLLBACK');
 });
 it('enforces customer creation permission',async()=>{
  const f=fixture({denyCreate:true});const input=dto();delete input.selections[0].customer_id;input.selections[0].new_customer_name='Khách';
  await expect(f.service.confirm(input,'actor')).rejects.toThrow('Forbidden');expect(f.customers.create).not.toHaveBeenCalled();
 });
 it('rejects exact source duplicates even when similar transactions are allowed',async()=>{
  const f=fixture({duplicate:true});const input=dto();input.selections[0].allow_possible_duplicate=true;
  await expect(f.service.confirm(input,'actor')).rejects.toThrow('dòng nguồn đã import');expect(f.quick.save).not.toHaveBeenCalled();
 });
 it('requires explicit acknowledgement for possible duplicates, not an absolute same-day block',async()=>{
  const f=fixture({similar:true});const input=dto();
  await expect(f.service.confirm(input,'actor')).rejects.toThrow('có giao dịch tương tự');
  input.selections[0].allow_possible_duplicate=true;
  await expect(f.service.confirm(input,'actor')).resolves.toBeDefined();
 });
 it('rolls back the entire batch after a business validation failure',async()=>{
  const f=fixture({fail:true});await expect(f.service.confirm(dto(),'actor')).rejects.toThrow('invalid item');
  expect(f.query).toHaveBeenLastCalledWith('ROLLBACK');expect(f.release).toHaveBeenCalled();
  expect(f.query.mock.calls.some(([sql])=>sql==='COMMIT')).toBe(false);
 });
 it('requires review acknowledgement before any business write',async()=>{
  const f=fixture();const input=dto();input.selections[0].confirmed_review=false;
  await expect(f.service.confirm(input,'actor')).rejects.toThrow('Chưa xác nhận');expect(f.quick.save).not.toHaveBeenCalled();
 });
});
