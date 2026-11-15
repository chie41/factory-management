import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { RbacService } from '../auth/rbac.service.js';
import { goldDeltaSql } from '../customer-ledger/gold-debt-rules.js';
import { units, toDecimal } from '../customer-ledger/ledger-decimal.js';
import type { GoldTemplateDto, GoldManualDto, GoldSaveDto } from './gold-refining.dto.js';

type Db = PoolClient;
type GoldWork = { id:string; title:string; workDate:string; issued:string; returned:string|null };
type GoldWorker = {id:string; name:string; jobs:GoldWork[]};
type GoldCustomerDebt = {customerId:string;customerCode:string;customerName:string;closingGoldG:string};
type Source = { workers:GoldWorker[]; customerDebt:string; customerDebts:GoldCustomerDebt[]; capturedAt:string; businessDate:string };
type Session = {
 id:string; business_date:string; status:'DRAFT'|'FINALIZED'|'LOCKED'|'REOPENED';
 version:number; source_snapshot:Source; manual_entries:GoldManualDto;
 layout_snapshot:GoldTemplateDto; selected_work_ids:string[];
 totals_snapshot:Record<string,string|null>|null; finalized_at:string|null; locked_at:string|null;
 lock_after_hours:number; created_at:string; updated_at:string;
 created_by:string; updated_by:string; finalized_by:string|null; reopened_by:string|null;
};
const INITIAL_LAYOUT: GoldTemplateDto = {
 boxes:[{id:'box-01',name:'Hộp 01',tareG:'455.00'}],
 bagWeights:['1.20','1.80','1.60','2.20','0.90'],
 labelWeights:['','','','','',''],
};
function checkedDate(date:string):string {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
  throw new BadRequestException('Ngày không hợp lệ YYYY-MM-DD');
 return date;
}
function qty(value:string):bigint {
 return units(value);
}
function signed(value:string|null|undefined):bigint {
 if(!value) return 0n;
 return value.startsWith('-') ? -qty(value.slice(1)) : qty(value);
}
function arraysOk(v:unknown,max=120): v is unknown[] {
 return Array.isArray(v) && v.length<=max;
}
function checkTemplate(layout:GoldTemplateDto):GoldTemplateDto {
 if(!layout || !arraysOk(layout.boxes,50) || !arraysOk(layout.bagWeights,50) || !arraysOk(layout.labelWeights,80))
  throw new BadRequestException('Mẫu có quá nhiều dòng');
 const ids=new Set<string>();
 for(const box of layout.boxes){
  if(!box.id || !box.name.trim() || box.id.length>100 || box.name.length>100 || ids.has(box.id) || box.id==='none')
   throw new BadRequestException('Mã hộp bị thiếu, trùng hoặc không hợp lệ');
  ids.add(box.id); qty(box.tareG);
 }
 for(const amount of [...layout.bagWeights,...layout.labelWeights]) if(amount!=='')qty(amount);
 return layout;
}
function checkManual(manual:GoldManualDto) {
 if(!manual || !arraysOk(manual.scales) || !arraysOk(manual.bags) || !arraysOk(manual.labels) || !arraysOk(manual.others))
  throw new BadRequestException('Dữ liệu nhập không hợp lệ hoặc quá nhiều dòng');
 for(const row of manual.scales) {if(row.gross!=='') qty(row.gross);}
 for(const row of [...manual.bags,...manual.labels]) {
  if(row.name.length>160) throw new BadRequestException('Tên dòng quá dài');
  if(row.unit!=='')qty(row.unit);
  if(row.count!=='' && (!/^(0|[1-9]\d{0,8})$/.test(row.count)))throw new BadRequestException('Số lượng phải là số nguyên không âm');
 }
 for(const row of manual.others){
  if(row.name.length>240)throw new BadRequestException('Nội dung quá dài');
  if(row.add!=='')qty(row.add);
  if(row.subtract!=='')qty(row.subtract);
 }
}
function defaultManual(layout:GoldTemplateDto):GoldManualDto {
 return {
  scales:Array.from({length:6},()=>({box:'',gross:''})),
  bags:[...layout.bagWeights.map(unit=>({name:'',unit,count:''})),{name:'',unit:'',count:''}],
  labels:layout.labelWeights.map(unit=>({name:'',unit,count:''})),
  others:Array.from({length:6},()=>({name:'',add:'',subtract:''})),
 };
}
function getWorks(source:Source):GoldWork[]{
 return source.workers.flatMap(worker=>worker.jobs);
}
export function calculateGoldTotals(source:Source,workIds:string[],manual:GoldManualDto,layout:GoldTemplateDto,previous:string|null,strict=false) {
 checkTemplate(layout);checkManual(manual);
 if(!arraysOk(workIds,2000)||new Set(workIds).size!==workIds.length)throw new BadRequestException('Danh sách công việc không hợp lệ');
 const works=getWorks(source), byId=new Map(works.map(work=>[work.id,work]));
 if(workIds.some(id=>!byId.has(id)))throw new ConflictException('Công việc không có trong snapshot. Hãy chọn lại từ danh sách.');
 let workerG=0n;
 for(const id of workIds){const work=byId.get(id)!;workerG+=signed(work.issued)-signed(work.returned);}
 const boxes=new Map(layout.boxes.map(box=>[box.id,qty(box.tareG)]));
 boxes.set('none',0n);
 let scaleG=0n;
 for(const row of manual.scales){
  if(row.gross==='')continue;
  if(!boxes.has(row.box)) {
   if(strict)throw new BadRequestException('Dòng cân đã nhập thiếu hộp hoặc hộp không có trong mẫu');
   continue;
  }
  const net=qty(row.gross)-boxes.get(row.box)!;
  if(net<0n)throw new BadRequestException('Số cân phải lớn hơn hoặc bằng trọng lượng vỏ hộp');
  scaleG+=net;
 }
 let bagsG=0n,labelsG=0n,plusG=0n,minusG=0n;
 for(const [rows,kind] of [[manual.bags,'bags'],[manual.labels,'labels']] as const){
  for(const row of rows){
   if(row.unit===''||row.count==='') {
    if(strict && row.count!=='' && row.unit==='') throw new BadRequestException('Dòng '+kind+' có số lượng nhưng thiếu trọng lượng');
    continue;
   }
   const result=qty(row.unit)*BigInt(row.count);
   if(kind==='bags')bagsG+=result; else labelsG+=result;
  }
 }
 for(const row of manual.others){if(row.add!=='')plusG+=qty(row.add);if(row.subtract!=='')minusG+=qty(row.subtract);}
 const debtG=signed(source.customerDebt);
 const grand=workerG+scaleG+debtG-bagsG-labelsG+plusG-minusG;
 return {
  worker_gold_g:toDecimal(workerG),scale_gold_g:toDecimal(scaleG),customer_debt_g:toDecimal(debtG),
  bag_gold_g:toDecimal(bagsG),label_gold_g:toDecimal(labelsG),
  other_plus_g:toDecimal(plusG),other_minus_g:toDecimal(minusG),
  total_gold_g:toDecimal(grand),previous_gold_g:previous,
  difference_g:previous===null?null:toDecimal(grand-signed(previous)),
 };
}
@Injectable()
export class GoldRefiningService {
 constructor(private readonly rbac:RbacService){}
 private async transaction<T>(fn:(client:Db)=>Promise<T>, snapshot=false):Promise<T>{
  const c=await this.rbac.pool.connect();
  try {
   await c.query(snapshot?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN');
   const result=await fn(c);
   await c.query('COMMIT');return result;
  } catch(error){await c.query('ROLLBACK');throw error}
  finally{c.release()}
 }
 private async audit(c:Db,id:string,actor:string,action:string,before:number|null,after:number,details:unknown={}) {
  await c.query('INSERT INTO gold_refining_session_events(session_id,actor_id,action,before_version,after_version,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
   [id,actor,action,before,after,JSON.stringify(details)]);
 }
 private async admin(actor:string,c:Db){
  const has=await c.query("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.code='ADMIN' LIMIT 1",[actor]);
  if(!has.rowCount)throw new ForbiddenException('Chỉ tài khoản có vai trò Admin được thay đổi mẫu mặc định hoặc mở lại phiên');
 }
 private async lockDue(c:Db){
  const changed=await c.query<{id:string;version:number;updated_by:string}>(
   "UPDATE gold_refining_sessions SET status='LOCKED',version=version+1,updated_at=clock_timestamp() WHERE status='FINALIZED' AND locked_at IS NOT NULL AND locked_at<=clock_timestamp() RETURNING id,version,updated_by");
  for(const row of changed.rows)await this.audit(c,row.id,row.updated_by,'LOCK',row.version-1,row.version,{automatic:true});
 }
 private async find(c:Db,id:string,lock=false):Promise<Session>{
  const result=await c.query<Session>('SELECT * FROM gold_refining_sessions WHERE id=$1'+(lock?' FOR UPDATE':''),[id]);
  if(!result.rows[0])throw new NotFoundException('Không tìm thấy phiên Tịnh vàng');
  return result.rows[0];
 }
 private ensureEditable(row:Session,version:number){
  if(row.version!==version)throw new ConflictException('Phiên đã thay đổi; tải lại trước khi lưu');
  if(!['DRAFT','REOPENED'].includes(row.status))throw new ConflictException('Phiên đã chốt hoặc khóa; không thể sửa');
 }
 private async previous(c:Db,date:string):Promise<string|null>{
  const r=await c.query<{gold:string|null}>(
   "SELECT totals_snapshot->>'total_gold_g' gold FROM gold_refining_sessions WHERE business_date<$1::date AND status IN ('FINALIZED','LOCKED') AND totals_snapshot IS NOT NULL ORDER BY business_date DESC LIMIT 1",[date]);
  return r.rows[0]?.gold??null;
 }
 private async layout(c:Db,date:string):Promise<GoldTemplateDto>{
  const r=await c.query<{template:GoldTemplateDto}>('SELECT template FROM gold_refining_layout_versions WHERE effective_from<=$1::date ORDER BY effective_from DESC LIMIT 1',[date]);
  return structuredClone(r.rows[0]?.template??INITIAL_LAYOUT);
 }
 private async source(c:Db,date:string):Promise<Source>{
  const works=await c.query<{id:string;employee_id:string;name:string;title:string;work_date:string;issued:string;returned:string|null}>(`
   WITH movements AS (
    SELECT m.employee_id,m.batch_id,m.step_id,
       MIN((m.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) work_date,
       SUM(m.quantity*m.effect) FILTER (WHERE m.kind IN ('INITIAL','ADDITIONAL','TRANSFER_IN')) issued,
       SUM(m.quantity*m.effect) FILTER (WHERE m.kind IN ('RETURN_UNUSED','RETURN_TOTAL','RECEIVE_PRODUCT','TRANSFER_OUT')) returned
    FROM batch_material_movements m
    WHERE m.material_type='GOLD' AND m.employee_id IS NOT NULL
      AND (m.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $1::date
    GROUP BY m.employee_id,m.batch_id,m.step_id
   )
   SELECT (m.batch_id::text||':'||m.step_id::text||':'||m.employee_id::text) id,
     m.employee_id,e.full_name name,(b.code||' · '||s.name) title,
     m.work_date::text work_date,
     COALESCE(m.issued,0)::text issued,
     m.returned::text returned
   FROM movements m
   JOIN employees e ON e.id=m.employee_id
   JOIN production_batches b ON b.id=m.batch_id
   JOIN batch_steps s ON s.batch_id=m.batch_id AND s.step_id=m.step_id
   WHERE COALESCE(m.issued,0)<>0 OR COALESCE(m.returned,0)<>0
   ORDER BY e.full_name,m.work_date,b.code,s.name,m.employee_id
   `,[date]);
  const byWorker=new Map<string,GoldWorker>();
  for(const item of works.rows){
   const worker=byWorker.get(item.employee_id)??{id:item.employee_id,name:item.name,jobs:[]};
   worker.jobs.push({id:item.id,title:item.title,workDate:item.work_date,issued:item.issued,returned:item.returned});
   byWorker.set(worker.id,worker);
  }
  const debt=await c.query<{customer_id:string;customer_code:string;customer_name:string;closing_gold_g:string;invalid_count:string}>(`
    WITH movements AS (
      SELECT customer_id,${goldDeltaSql('l')} delta
      FROM customers_ledger l
      WHERE business_date<=$1::date
    ), balances AS (
      SELECT customer_id,SUM(delta) balance,COUNT(*) FILTER(WHERE delta IS NULL) invalid
      FROM movements GROUP BY customer_id
    )
    SELECT c.id customer_id,c.customer_code,c.name customer_name,
      COALESCE(b.balance,0)::text closing_gold_g,b.invalid::text invalid_count
    FROM balances b JOIN customers c ON c.id=b.customer_id
    ORDER BY c.name,c.customer_code
  `,[date]);
  if(debt.rows.some(row=>BigInt(row.invalid_count)>0n))
   throw new BadRequestException('Nợ vàng có loại giao dịch chưa định nghĩa, không thể tạo snapshot');
  const customerDebts=debt.rows
    .filter(row=>signed(row.closing_gold_g)>0n)
    .map(row=>({customerId:row.customer_id,customerCode:row.customer_code,customerName:row.customer_name,closingGoldG:row.closing_gold_g}));
  const closing=customerDebts.reduce((sum,item)=>sum+signed(item.closingGoldG),0n);
  return {
   workers:[...byWorker.values()],
   customerDebt:toDecimal(closing),
   customerDebts,
   capturedAt:new Date().toISOString(),
   businessDate:date,
  };
 }
 async list(month:string){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new BadRequestException('Tháng không hợp lệ');
  return this.transaction(async c=>{
   await this.lockDue(c);
   const r=await c.query(`
    SELECT s.id,s.business_date::text session_date,s.status,s.version,s.finalized_at,
      coalesce(e.full_name,u.username) operator_name,
      s.totals_snapshot->>'total_gold_g' total_gold_g,
      s.totals_snapshot->>'difference_g' difference_g,
      s.created_at,s.updated_at
    FROM gold_refining_sessions s
    JOIN users u ON u.id=s.created_by
    LEFT JOIN employees e ON e.id=u.employee_id
    WHERE s.business_date >= ($1||'-01')::date
      AND s.business_date < (($1||'-01')::date+interval '1 month')::date
    ORDER BY s.business_date DESC
   `,[month]);
   return {data:r.rows};
  });
 }
 async byDate(date:string){
  checkedDate(date);
  return this.transaction(async c=>{
   await this.lockDue(c);
   const r=await c.query<Session>('SELECT * FROM gold_refining_sessions WHERE business_date=$1::date',[date]);
   return {data:r.rows[0]??null};
  });
 }
 async detail(id:string){
  return this.transaction(async c=>{await this.lockDue(c);return {data:await this.find(c,id)};});
 }
 async template(date:string){
  checkedDate(date);
  return this.transaction(async c=>({data:await this.layout(c,date)}));
 }
 async saveTemplate(date:string,template:GoldTemplateDto,actor:string){
  checkedDate(date);checkTemplate(template);
  return this.transaction(async c=>{
   await this.admin(actor,c);
   await c.query(`INSERT INTO gold_refining_layout_versions(effective_from,template,changed_by)
     VALUES($1::date,$2::jsonb,$3)
     ON CONFLICT(effective_from) DO UPDATE SET template=EXCLUDED.template,changed_by=EXCLUDED.changed_by,changed_at=clock_timestamp()`,[date,JSON.stringify(template),actor]);
   return {data:{effectiveFrom:date,template}};
  });
 }
 async create(date:string,actor:string){
  checkedDate(date);
  return this.transaction(async c=>{
   await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:gold-sessions'))");
   const exists=await c.query('SELECT id FROM gold_refining_sessions WHERE business_date=$1::date',[date]);
   if(exists.rowCount)throw new ConflictException('Ngày này đã có phiên Tịnh vàng; hãy mở phiên hiện có');
   const layout=await this.layout(c,date),source=await this.source(c,date);
   const manual=defaultManual(layout),ids=getWorks(source).map(work=>work.id);
   const prev=await this.previous(c,date);
   const calculated=calculateGoldTotals(source,ids,manual,layout,prev);
   const r=await c.query<Session>(`INSERT INTO gold_refining_sessions
    (business_date,source_snapshot,selected_work_ids,manual_entries,layout_snapshot,totals_snapshot,created_by,updated_by)
    VALUES($1::date,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$7) RETURNING *`,
    [date,JSON.stringify(source),JSON.stringify(ids),JSON.stringify(manual),JSON.stringify(layout),JSON.stringify(calculated),actor]);
   await this.audit(c,r.rows[0].id,actor,'CREATE',null,1,{date});
   return {data:r.rows[0]};
  },true);
 }
 async save(id:string,dto:GoldSaveDto,actor:string){
  return this.transaction(async c=>{
   await this.lockDue(c);
   const row=await this.find(c,id,true);
   this.ensureEditable(row,dto.version);
   const prev=await this.previous(c,row.business_date);
   const calculated=calculateGoldTotals(row.source_snapshot,dto.selectedWorkIds,dto.manual,dto.layout,prev);
   const updated=await c.query<Session>(`UPDATE gold_refining_sessions
    SET selected_work_ids=$2::jsonb,manual_entries=$3::jsonb,layout_snapshot=$4::jsonb,
       totals_snapshot=$5::jsonb,updated_by=$6,updated_at=clock_timestamp(),version=version+1
    WHERE id=$1 RETURNING *`,[id,JSON.stringify(dto.selectedWorkIds),JSON.stringify(dto.manual),JSON.stringify(dto.layout),JSON.stringify(calculated),actor]);
   await this.audit(c,id,actor,'UPDATE',row.version,updated.rows[0].version);
   return {data:updated.rows[0]};
  });
 }
 async reload(id:string,version:number,actor:string){
  return this.transaction(async c=>{
   await this.lockDue(c);
   const row=await this.find(c,id,true);
   this.ensureEditable(row,version);
   const source=await this.source(c,row.business_date);
   const available=new Set(getWorks(source).map(work=>work.id));
   const ids=row.selected_work_ids.filter(id=>available.has(id));
   const removed=row.selected_work_ids.filter(id=>!available.has(id));
   const calculated=calculateGoldTotals(source,ids,row.manual_entries,row.layout_snapshot,await this.previous(c,row.business_date));
   const updated=await c.query<Session>(`UPDATE gold_refining_sessions
    SET source_snapshot=$2::jsonb,selected_work_ids=$3::jsonb,totals_snapshot=$4::jsonb,
      updated_by=$5,updated_at=clock_timestamp(),version=version+1
    WHERE id=$1 RETURNING *`,[id,JSON.stringify(source),JSON.stringify(ids),JSON.stringify(calculated),actor]);
   await this.audit(c,id,actor,'RELOAD',row.version,updated.rows[0].version,{removed_work_ids:removed});
   return {data:updated.rows[0],warnings:removed.length?{removedWorkIds:removed}:null};
  },true);
 }
 async finalize(id:string,version:number,actor:string,lockAfterHours?:number){
  return this.transaction(async c=>{
   await c.query("SELECT pg_advisory_xact_lock(hashtext('factory:gold-sessions'))");
   await this.lockDue(c);
   const row=await this.find(c,id,true);
   this.ensureEditable(row,version);
   if(lockAfterHours!==undefined)await this.admin(actor,c);
   const hours=lockAfterHours??row.lock_after_hours;
   const calculated=calculateGoldTotals(row.source_snapshot,row.selected_work_ids,row.manual_entries,row.layout_snapshot,
    await this.previous(c,row.business_date),true);
   const updated=await c.query<Session>(`UPDATE gold_refining_sessions
     SET status=CASE WHEN $3::int=0 THEN 'LOCKED' ELSE 'FINALIZED' END,
       finalized_by=$4,finalized_at=clock_timestamp(),locked_at=clock_timestamp()+make_interval(hours=>$3::int),
       lock_after_hours=$3,updated_by=$4,updated_at=clock_timestamp(),
       totals_snapshot=$2::jsonb,version=version+1
     WHERE id=$1 RETURNING *`,[id,JSON.stringify(calculated),hours,actor]);
   await this.audit(c,id,actor,'FINALIZE',row.version,updated.rows[0].version,{lock_after_hours:hours});
   return {data:updated.rows[0]};
  });
 }
 async reopen(id:string,version:number,actor:string,reason:string){
  if(reason.trim().length<8)throw new BadRequestException('Cần lý do mở lại ít nhất 8 ký tự');
  return this.transaction(async c=>{
   await this.admin(actor,c);
   await this.lockDue(c);
   const row=await this.find(c,id,true);
   if(row.version!==version)throw new ConflictException('Phiên đã thay đổi');
   if(row.status!=='FINALIZED'&&row.status!=='LOCKED')throw new ConflictException('Chỉ mở lại phiên đã chốt hoặc đã khóa');
   const updated=await c.query<Session>(`UPDATE gold_refining_sessions SET status='REOPENED',
     reopened_by=$2,updated_by=$2,updated_at=clock_timestamp(),locked_at=NULL,version=version+1 WHERE id=$1 RETURNING *`,[id,actor]);
   await this.audit(c,id,actor,'REOPEN',row.version,updated.rows[0].version,{reason});
   return {data:updated.rows[0]};
  });
 }
}
