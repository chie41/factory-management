import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { RbacService } from '../../auth/rbac.service.js';
import { CustomersService } from '../../customers/customers.service.js';
import { QuickEntryService } from '../workflow/quick-entry.service.js';
import { LedgerWorkflowService } from '../workflow/ledger-workflow.service.js';
import { digest, normalized, parseSheets, readExcel, IMPORT_TRANSACTION_OPTIONS, type ImportGroup } from './excel-parser.js';
import type { ConfirmExcelDto, PreviewExcelDto, GroupSelectionDto } from './excel-import.dto.js';
import { units } from '../ledger-decimal.js';

type Db = Pool | PoolClient;
type Choice = { id: string; code: string; name: string };
const exact = (text: string, choices: Choice[]) => {
 const matches=choices.filter(c=>normalized(c.name)===normalized(text)||normalized(c.code)===normalized(text));
 return matches.length===1?matches[0].id:undefined;
};
@Injectable()
export class ExcelImportService {
 constructor(private readonly rbac: RbacService, private readonly quick: QuickEntryService,
  private readonly workflow: LedgerWorkflowService, private readonly customers: CustomersService) {}

 private async prepare(dto: PreviewExcelDto, actor: string, db: Db = this.rbac.pool) {
  await this.rbac.require(actor,['customer_ledger.create'],db);
  if(!dto.bulk&&!dto.customer_id)throw new BadRequestException('Import riêng cần customer ID của sổ đang mở');
  const sheets=await readExcel(dto.file_base64,dto.bulk);
  const parsed=parseSheets(sheets,dto.bulk,dto.edits,dto.splits,dto.ignored_rows);
  const customers=(await db.query<Choice>('SELECT id,customer_code code,name FROM customers WHERE deleted_at IS NULL ORDER BY customer_code,id')).rows;
  if(!dto.bulk&&!customers.some(c=>c.id===dto.customer_id))throw new BadRequestException('Không tìm thấy khách hàng của sổ');
  const employees=await this.quick.eligibleEmployees(db);
  const models=(await db.query<Choice>("SELECT id,code,name FROM design_models WHERE status='ACTIVE' ORDER BY code,id")).rows;
  const deliveries=(await db.query("SELECT l.id,l.customer_id,l.business_date::text date,l.gold_weight_g::text gold,l.labor_amount_due::text labor FROM customers_ledger l WHERE l.transaction_type='DELIVERY' AND l.approval_status='APPROVED' AND l.reversed_at IS NULL ORDER BY l.business_date DESC,l.id LIMIT 5000")).rows;
  const file_sha=createHash('sha256').update(Buffer.from(dto.file_base64,'base64')).digest('hex');
  const prior=(await db.query('SELECT file_sha,sheet,source_rows,customer_id,kind,content_hash FROM ledger_excel_import_sources WHERE file_sha=$1 OR content_hash=ANY($2::text[])',[file_sha,parsed.groups.map(g=>g.content_hash)])).rows;
  const dates=[...new Set(parsed.groups.map(g=>g.date).filter(Boolean))];
  const history=(await db.query("SELECT customer_id,business_date::text date,transaction_type kind,gold_weight_g::text value FROM customers_ledger WHERE business_date=ANY($1::date[]) AND reversed_at IS NULL UNION ALL SELECT l.customer_id,p.business_date::text,'PAYMENT',p.amount::text FROM ledger_payments p JOIN customers_ledger l ON l.id=p.ledger_id WHERE p.business_date=ANY($1::date[]) AND p.status<>'VOID'",[dates])).rows;
  const groups=parsed.groups.map(g=>{
   const customer_id=dto.bulk?exact(g.customer,customers):dto.customer_id;
   return {...g,customer_id,employee_id:exact(g.employee,employees),collector_id:exact(g.collector,employees),
    model_mappings:g.lines.map(l=>({row:l.row,model_id:exact(l.name,models)})),
    duplicate:prior.some(p=>p.file_sha===file_sha&&p.sheet===g.sheet&&p.customer_id===customer_id&&p.kind===g.kind&&g.rows.some(row=>p.source_rows.includes(row))),
    possible_duplicate:prior.some(p=>p.content_hash===g.content_hash&&p.customer_id===customer_id)||history.some(p=>p.customer_id===customer_id&&p.date===g.date&&p.kind===g.kind&&p.value===(g.kind==='PAYMENT'?g.amount:g.gold)),
   };
  });
  return {file_sha,sheets,groups,ignored:parsed.ignored,customers,employees,models,deliveries,transaction_types:IMPORT_TRANSACTION_OPTIONS};
 }
 async preview(dto: PreviewExcelDto, actor: string) { return {data:await this.prepare(dto,actor)}; }

 async confirm(dto: ConfirmExcelDto, actor: string) {
  const c=await this.rbac.pool.connect();
  try {
   await c.query('BEGIN');
   // Match the existing workflow lock order; serialize duplicate detection + business writes.
   await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:ledger-workflow'))");
   await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:rbac'))");
   await this.rbac.require(actor,['customer_ledger.create'],c);
   const intent=digest(dto);
   const previous=(await c.query('SELECT * FROM ledger_excel_import_batches WHERE request_id=$1',[dto.request_id])).rows[0];
   if(previous) {
    if(previous.actor_id!==actor||previous.intent_hash!==intent)throw new ConflictException('Mã lần import đã dùng cho dữ liệu khác');
    await c.query('COMMIT');return {data:previous.result};
   }
   const prepared=await this.prepare(dto,actor,c);
   const selected=new Map(dto.selections.map(s=>[s.group_id,s]));
   if(selected.size!==dto.selections.length)throw new BadRequestException('Chọn trùng nhóm giao dịch');
   for(const s of dto.selections) {
    const g=prepared.groups.find(g=>g.id===s.group_id);
    if(!g||g.errors.length||g.kind==='REVIEW')throw new BadRequestException(`Nhóm ${s.group_id}: ${g?.errors.join('; ')||'không hợp lệ'}`);
   }
   const assignments=new Map<string,string>();
   const created=new Map<string,string>();
   // Use the existing customer validation, duplicate-name check and code sequence in this transaction.
   for(const g of prepared.groups.filter(g=>selected.has(g.id))) {
    const s=selected.get(g.id)!;
    let id=dto.bulk?s.customer_id:dto.customer_id;
    if(!id&&s.new_customer_name) {
     await this.rbac.require(actor,['customers.create'],c);
     const name=s.new_customer_name.trim();
     if(!name||name.length>180)throw new BadRequestException('Tên khách hàng mới phải có 1–180 ký tự');
     const key=normalized(name);
     id=created.get(key);
     if(!id) { id=String((await this.customers.create({name},actor,c)).data.id);created.set(key,id); }
    }
    if(!id)throw new BadRequestException(`Nhóm ${g.id}: chọn khách có sẵn, tạo mới hoặc bỏ chọn nhóm`);
    if(!(await c.query('SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL',[id])).rowCount)throw new BadRequestException('Khách hàng không tồn tại');
    assignments.set(g.id,id);
   }
   const entryIds=new Map<string,string>();
   const result: {group_id:string;id:string;kind:string;status:string}[]=[];
   await c.query('INSERT INTO ledger_excel_import_batches(request_id,actor_id,intent_hash,file_sha,file_name) VALUES($1,$2,$3,$4,$5)',[dto.request_id,actor,intent,prepared.file_sha,dto.file_name]);
   // Deliveries and gold receipts first; payments may target any selected delivery regardless of row order.
   const groups=prepared.groups.filter(g=>selected.has(g.id)).sort((a,b)=>Number(a.kind==='PAYMENT')-Number(b.kind==='PAYMENT'));
   const eligible=new Set(prepared.employees.map(e=>e.id));
   const knownModels=new Set(prepared.models.map(m=>m.id));
   for(const g of groups) {
    const s=selected.get(g.id)!;const customer=assignments.get(g.id)!;
    const duplicate=(await c.query('SELECT id FROM ledger_excel_import_sources WHERE file_sha=$1 AND sheet=$2 AND customer_id=$3 AND kind=$4 AND source_rows && $5::int[]',[prepared.file_sha,g.sheet,customer,g.kind,g.rows])).rowCount;
    if(duplicate)throw new ConflictException(`Nhóm ${g.id}: dòng nguồn đã import; không ghi đè`);
    const similar=(await c.query('SELECT id FROM ledger_excel_import_sources WHERE customer_id=$1 AND content_hash=$2',[customer,g.content_hash])).rowCount;
    const similarBusiness=g.kind==='PAYMENT'
     ? (await c.query("SELECT p.id FROM ledger_payments p JOIN customers_ledger l ON l.id=p.ledger_id WHERE l.customer_id=$1 AND p.business_date=$2 AND p.amount=$3 AND p.status<>'VOID'",[customer,g.date,g.amount])).rowCount
     : (await c.query('SELECT id FROM customers_ledger WHERE customer_id=$1 AND business_date=$2 AND transaction_type=$3 AND gold_weight_g=$4 AND reversed_at IS NULL',[customer,g.date,g.kind,g.gold])).rowCount;
    if((similar||similarBusiness)&&!s.allow_possible_duplicate)throw new ConflictException(`Nhóm ${g.id}: có giao dịch tương tự; cần xác nhận cảnh báo có khả năng trùng`);
    let id: string;let status: string;
    if(g.kind==='PAYMENT') {
     await this.rbac.require(actor,['customer_ledger.collect'],c);
     if(!s.collector_id||!eligible.has(s.collector_id))throw new BadRequestException(`Nhóm ${g.id}: chọn người thu hợp lệ`);
     const parent=s.payment_target_group || g.parent;
     const target=s.payment_target_id || (parent?entryIds.get(parent):undefined);
     if(!target)throw new BadRequestException(`Nhóm ${g.id}: chọn phiếu giao hàng được thanh toán`);
     const root=(await c.query('SELECT customer_id,business_date::text date FROM customers_ledger WHERE id=$1',[target])).rows[0];
     if(!root||root.customer_id!==customer)throw new BadRequestException('Khoản thu và phiếu giao không cùng khách hàng');
     if(g.date<root.date)throw new BadRequestException('Ngày thu không được trước ngày giao của phiếu đích');
     const state=await this.workflow.detail(target,c);
     const pending=(await c.query("SELECT coalesce(sum(amount),0)::text amount FROM ledger_payments WHERE ledger_id=$1 AND currency='THB' AND status='PENDING'",[target])).rows[0].amount;
     if(units(g.amount)+units(pending)>units(String(state.outstanding_baht)))throw new BadRequestException('Số tiền thu vượt tiền công còn phải thu (kể cả khoản đang chờ duyệt)');
     const payment=await this.workflow.collect(target,{request_id:randomUUID(),amount:g.amount,currency:'THB',employee_id:s.collector_id,note:g.note||undefined,business_date:g.date,occurred_at:`${g.date}T12:00:00+07:00`},actor,'LEDGER',c);
     id=String(payment.data.id);status=String(payment.data.status);
    } else {
     if(!s.employee_id||!eligible.has(s.employee_id))throw new BadRequestException(`Nhóm ${g.id}: chọn nhân viên giao dịch hợp lệ`);
     const mapping=new Map((s.models??[]).map(m=>[m.row,m.model_id]));
     for(const line of g.lines)if(!knownModels.has(mapping.get(line.row)??''))throw new BadRequestException(`Dòng ${line.row}: chọn mẫu mã đang hoạt động`);
     const saved=await this.quick.save({request_id:randomUUID(),entries:[{request_id:randomUUID(),customer_id:customer,employee_id:s.employee_id,transaction_type:g.kind,occurred_at:`${g.date}T12:00:00+07:00`,gold_weight_g:g.gold,note:g.note||undefined,...(g.kind==='DELIVERY'?{items:g.lines.map(l=>({design_model_id:mapping.get(l.row)!,quantity:l.quantity,unit_weight_g:l.unit_weight_g,labor_price_per_15g:l.price}))}:{})}]},actor,undefined,undefined,c);
     id=String(saved.data.entries[0]!.id);status=String(saved.data.entries[0]!.approval_status);
     entryIds.set(g.id,id);
    }
    await this.trace(c,dto,prepared.file_sha,g,customer,id,s,prepared.sheets.find(sheet=>sheet.name===g.sheet)!.rows.filter(r=>g.rows.includes(r.row)));
    result.push({group_id:g.id,id,kind:g.kind,status});
   }
   const response={batch_id:dto.request_id,entries:result};
   await c.query('UPDATE ledger_excel_import_batches SET result=$2::jsonb WHERE request_id=$1',[dto.request_id,JSON.stringify(response)]);
   await c.query('INSERT INTO security_audit(actor_id,action,after_state) VALUES($1,$2,$3::jsonb)',[actor,'ledger.excel_import',JSON.stringify(response)]);
   await c.query('COMMIT');return {data:response};
  } catch(error) { await c.query('ROLLBACK');throw error; }
  finally {c.release();}
 }
 private async trace(c:PoolClient,dto:ConfirmExcelDto,file:string,g:ImportGroup,customer:string,id:string,selection:GroupSelectionDto,raw:unknown) {
  await c.query('INSERT INTO ledger_excel_import_sources(batch_id,file_sha,sheet,source_rows,customer_id,kind,content_hash,target_id,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',[
   dto.request_id,file,g.sheet,g.rows,customer,g.kind,g.content_hash,id,JSON.stringify({raw,group:g,selection,edits:dto.edits??[],splits:dto.splits??[],ignored_rows:dto.ignored_rows??[]}),
  ]);
 }
}
