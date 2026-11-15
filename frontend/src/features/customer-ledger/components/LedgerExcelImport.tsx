import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Checkbox, Collapse, Input, Modal, Select, Space, Table, Tag, Upload } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { workflowWrite } from '../services/workflowService'
import { markLedgerDraft } from '../hooks/ledgerDraftGuard'
import '../styles/ledger-excel-import.css'

type Choice = { id: string; code: string; name: string }
type Source = { row: number; cells: string[] }
type Edit = Source & { sheet: string }
type Group = {
 id:string; sheet:string; rows:number[]; content_hash:string; kind:string; type_row?:number; declared_type?:string; customer:string; customer_id?:string; date:string;
 date_row?:number; date_column?:number; date_inherited?:boolean; date_source_row?:number; employee:string; employee_id?:string;
 gold:string; labor:string; amount:string; collector:string; collector_id?:string; note:string; parent?:string;
 errors:string[]; warnings:string[]; duplicate:boolean; possible_duplicate:boolean;
 lines:{row:number;name:string;quantity:number;unit_weight_g:string;total_weight_g:string;price:string;labor:string}[];
 model_mappings:{row:number;model_id?:string}[];
}
type Preview = {
 transaction_types:{value:string;label:string}[]; groups:Group[]; sheets:{name:string;rows:Source[]}[]; ignored:{sheet:string;row:number;reason:string}[];
 customers:Choice[]; employees:Choice[]; models:Choice[];
 deliveries:{id:string;customer_id:string;date:string;gold:string;labor:string}[];
}
type Selection = { group_id:string; customer_id?:string; new_customer_name?:string; employee_id?:string;collector_id?:string;
 models?:{row:number;model_id?:string}[]; payment_target_group?:string;payment_target_id?:string;allow_possible_duplicate?:boolean }
const headers=['NGÀY','LOẠI GIAO DỊCH','NGƯỜI GIAO DỊCH','NỢ','NHẬN (-)','GIAO (+)','TÍNH','CHI TIẾT','SỐ LƯỢNG','TRỌNG LƯỢNG ĐƠN','TRỌNG LƯỢNG TỔNG','GIÁ CÔNG','CÔNG','TỔNG CÔNG','NGÀY THU','SỐ TIỀN','NGƯỜI THU','GHI CHÚ']
const labels:Record<string,string>={DELIVERY:'Giao hàng (+)',RETURN_GOLD:'Khách trả vàng (-)',GOLD_RETURN_TO_CUSTOMER:'Trả vàng cho khách (+)',RETURN_RECOVERED_GOLD:'Khách trả vàng hồi (-)',RETURN_GOODS:'Trả hàng (-)',PAYMENT:'Thu tiền công',REVIEW:'Cần kiểm tra nhóm'}
const choiceOptions=(items:Choice[])=>items.map(c=>({value:c.id,label:`${c.code} · ${c.name}`}))
const errorText=(error:unknown)=>{const value=error as {response?:{data?:{message?:string|string[]}}};const message=value.response?.data?.message;return Array.isArray(message)?message.join('; '):message??'Không xử lý được file. Vui lòng thử lại.'}

export function LedgerExcelImport({customerId}:{customerId?:string}) {
 const {can}=usePermissions()
 const {message}=App.useApp()
 const cache=useQueryClient()
 const [open,setOpen]=useState(false)
 const [file,setFile]=useState<{file_base64:string;file_name:string}>()
 const [preview,setPreview]=useState<Preview>()
 const [busy,setBusy]=useState(false)
 const busyRef=useRef(false)
 const [error,setError]=useState('')
 const [selected,setSelected]=useState<string[]>([])
 const [mapping,setMapping]=useState<Record<string,Selection>>({})
 const [edits,setEdits]=useState<Edit[]>([])
 const [splits,setSplits]=useState<{sheet:string;row:number}[]>([])
 const [ignoredRows,setIgnoredRows]=useState<{sheet:string;row:number}[]>([])
 const [sourceSheet,setSourceSheet]=useState<string>()
 const [sourceEdits,setSourceEdits]=useState<Edit[]>([])
 const [sourceSplits,setSourceSplits]=useState<{sheet:string;row:number}[]>([])
 const [sourceIgnoredRows,setSourceIgnoredRows]=useState<{sheet:string;row:number}[]>([])
 const [needsPreview,setNeedsPreview]=useState(false)
 const attempt=useRef<{hash:string;request_id:string} | undefined>(undefined)
 const dirty=open&&!!file
 useEffect(()=>{
  const key=`excel-import:${customerId??'all'}`
  markLedgerDraft(key,dirty)
  const unload=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}}
  window.addEventListener('beforeunload',unload)
  return ()=>{markLedgerDraft(key,false);window.removeEventListener('beforeunload',unload)}
 },[dirty,customerId])
 const close=()=>{
  if(busyRef.current)return
  if(file&&!window.confirm('Đóng bản xem trước Import chưa xác nhận?'))return
  setOpen(false);setFile(undefined);setPreview(undefined);setError('');setSelected([]);setMapping({});setEdits([]);setSplits([]);setIgnoredRows([]);setNeedsPreview(false);attempt.current=undefined
 }
 const patch=(id:string,change:Partial<Selection>)=>setMapping(previous=>({...previous,[id]:{...previous[id],...change}}))
 const load=async(input:NonNullable<typeof file>,nextEdits:Edit[]=[],nextSplits:typeof splits=[],nextIgnored:typeof ignoredRows=ignoredRows,preserveDraft=false)=>{
  if(busyRef.current)return
  busyRef.current=true;setBusy(true);setError('')
  try {
   const data=await workflowWrite<Preview>('/customer-ledger/excel-import/preview',{...input,bulk:!customerId,customer_id:customerId,edits:nextEdits,splits:nextSplits,ignored_rows:nextIgnored})
   setPreview(data);setEdits(nextEdits);setSplits(nextSplits);setIgnoredRows(nextIgnored);setNeedsPreview(false)
   const valid=data.groups.filter(g=>!g.errors.length&&!g.duplicate&&g.kind!=='REVIEW').map(g=>g.id)
   setSelected(previous=>preserveDraft?previous.filter(id=>valid.includes(id)):valid.slice(0,100))
   setMapping(previous=>Object.fromEntries(data.groups.map(g=>{
    const old=preview?.groups.find(item=>item.id===g.id)
    const unchanged=preserveDraft&&old&&old.content_hash===g.content_hash&&previous[g.id]
    return [g.id,unchanged?previous[g.id]:{group_id:g.id,customer_id:g.customer_id,employee_id:g.employee_id,collector_id:g.collector_id,models:g.model_mappings,payment_target_group:g.parent}]
   })))
  }catch(e){setError(errorText(e));setNeedsPreview(true)}
  finally{busyRef.current=false;setBusy(false)}
 }
 const upload=async(uploaded:File)=>{
  if(!/\.xlsx$/i.test(uploaded.name)||uploaded.size>4*1024*1024){message.error('Chọn file .xlsx tối đa 4 MB');return false}
  if(file&&!window.confirm('Thay file sẽ đặt lại bản xem trước và ánh xạ chưa lưu. Tiếp tục?'))return false
  const bytes=new Uint8Array(await uploaded.arrayBuffer());let binary=''
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
  const input={file_base64:btoa(binary),file_name:uploaded.name}
  setFile(input);setPreview(undefined);attempt.current=undefined
  setEdits([]);setSplits([]);setIgnoredRows([]);setMapping({});setSelected([])
  await load(input,[],[],[]);return false
 }
 const confirm=async()=>{
  if(!file||!preview||busyRef.current||needsPreview)return
  const selections=selected.map(id=>mapping[id])
  if(!selected.length||selected.length>100||selections.some(s=>!s)){message.error('Chọn từ 1–100 nghiệp vụ có dữ liệu ánh xạ');return}
  if(!window.confirm(`Import ${selected.length} nghiệp vụ đã chọn? Giao dịch và khoản thu được ghi nhận ngay sau khi lưu.`))return
  const payload={...file,bulk:!customerId,customer_id:customerId,edits,splits,ignored_rows:ignoredRows,currency:'THB',selections}
  const hash=JSON.stringify(payload)
  if(attempt.current?.hash!==hash)attempt.current={hash,request_id:crypto.randomUUID()}
  busyRef.current=true;setBusy(true);setError('')
  try{
   const result=await workflowWrite<{batch_id:string;entries:{status:string}[]}>('/customer-ledger/excel-import/confirm',{...payload,request_id:attempt.current.request_id})
   await Promise.all([['ledger'],['ledger-entry'],['ledger-workflow'],['customer-ledger','daily-gold'],['customers'],['cash']].map(queryKey=>cache.invalidateQueries({queryKey})))
   message.success(`Đã import ${result.entries.length} nghiệp vụ`)
   setOpen(false);setFile(undefined);setPreview(undefined);setEdits([]);setSplits([]);setIgnoredRows([]);setMapping({});setSelected([]);attempt.current=undefined
  }catch(e){setError(errorText(e))}finally{busyRef.current=false;setBusy(false)}
 }
 const skipGroup=async(group:Group)=>{
  if(!file||busyRef.current)return
  if(!window.confirm(`Bỏ qua các dòng ${group.rows.join(', ')} của sheet ${group.sheet} trong lần import này? Mọi nghiệp vụ từ các dòng này sẽ bị loại khỏi bản import. File Excel và dữ liệu đã lưu không bị xóa.`))return
  const next=[...ignoredRows]
  for(const row of group.rows)if(!next.some(item=>item.sheet===group.sheet&&item.row===row))next.push({sheet:group.sheet,row})
  await load(file,edits,splits,next,true)
 }
 if(!can('customer_ledger.create'))return null
 const missing=(g:Group,s:Selection|undefined):string[]=>{
  if(!s)return ['Chưa có ánh xạ']
  const errors:string[]=[]
  if(!customerId&&!s.customer_id&&!s.new_customer_name?.trim())errors.push('Chọn khách hàng đích / tạo mới hoặc bỏ chọn nhóm')
  if(g.kind==='PAYMENT'){
   if(!s.collector_id)errors.push('Chọn người thu')
   if(!s.payment_target_id&&(!s.payment_target_group||!selected.includes(s.payment_target_group)))errors.push('Chọn phiếu giao được thanh toán (phiếu trong file phải được chọn import)')
  }else if(g.kind!=='REVIEW'){
   if(!s.employee_id)errors.push('Chọn nhân viên giao dịch')
   if(g.lines.some(l=>!s.models?.find(m=>m.row===l.row)?.model_id))errors.push('Ghép đủ mẫu mã cho các dòng chi tiết')
  }
  if(g.possible_duplicate&&!s.allow_possible_duplicate)errors.push('Kiểm tra cảnh báo có khả năng trùng, cho phép rõ ràng hoặc bỏ chọn')
  return errors
 }
 const blocked=selected.some(id=>{const g=preview?.groups.find(g=>g.id===id);return !g||g.errors.length>0||g.duplicate||missing(g,mapping[id]).length>0})
 const displayHeaders=[...headers];if(!customerId)displayHeaders.splice(1,0,'KHÁCH HÀNG')
 const source=preview?.sheets.find(s=>s.name===sourceSheet)
 return <>
 <Button onClick={()=>setOpen(true)}>Import Excel</Button>
 <Modal open={open} title={customerId?'Import Excel vào sổ khách hàng':'Import Excel nhiều khách hàng'} width={1150} onCancel={close} maskClosable={false} closable={!busy} footer={<Space><Button disabled={busy} onClick={close}>Đóng</Button><Button type="primary" loading={busy} disabled={!preview||!selected.length||selected.length>100||needsPreview||blocked} onClick={()=>void confirm()}>Xác nhận Import ({selected.length})</Button></Space>}>
  <Space wrap className="ledger-import-toolbar">
   <Button href={`${import.meta.env.BASE_URL}templates/ledger-import-${customerId?'single':'bulk'}.xlsx`} download>Tải Excel mẫu</Button>
   <Upload accept=".xlsx" showUploadList={false} disabled={busy} beforeUpload={upload}><Button loading={busy}>Chọn file Excel</Button></Upload>
   {file&&<span>{file.file_name}</span>}
   {file&&<Button disabled={busy} onClick={()=>void load(file,edits,splits)}>Đọc lại xem trước</Button>}
  </Space>
  <Alert type="info" title="Giữ nguyên cột Excel cũ; không nhập NỢ CŨ" description="Mỗi dòng có LOẠI GIAO DỊCH bắt đầu một giao dịch mới; các dòng chi tiết bên dưới không cần lặp ngày hoặc loại. Không suy đoán loại từ NHẬN (-) / GIAO (+). NGÀY THU được đọc riêng. NỢ và TÍNH không tạo giao dịch. File chưa được ghi vào database khi xem trước." />
  {error&&<Alert type="error" showIcon title={error} />}
  {preview&&<>
   <Space wrap className="ledger-import-toolbar"><b>{preview.groups.length} nghiệp vụ nhận diện · {preview.ignored.length} dòng bỏ qua · tối đa 100 nghiệp vụ/lần xác nhận</b>{preview.sheets.map(s=><Button key={s.name} disabled={busy} onClick={()=>{setSourceSheet(s.name);setSourceEdits(edits);setSourceSplits(splits);setSourceIgnoredRows(ignoredRows)}}>Dòng nguồn: {s.name}</Button>)}</Space>
   <p>Đơn vị: vàng (g), GIÁ CÔNG theo 15g; CÔNG / TỔNG CÔNG / SỐ TIỀN bằng THB. Khoản thu được ghi nhận trực tiếp khi import.</p>
   <div className="ledger-import-groups">{preview.groups.map(g=>{
    const s=mapping[g.id];if(!s)return null
    const targetOptions=[...preview.groups.filter(p=>p.kind==='DELIVERY'&&selected.includes(p.id)&&((s.customer_id&&mapping[p.id]?.customer_id===s.customer_id)||(s.new_customer_name&&mapping[p.id]?.new_customer_name===s.new_customer_name))).map(p=>({value:`group:${p.id}`,label:`Trong file: ${p.sheet} dòng ${p.rows.join(', ')} · ${p.date}`})),...preview.deliveries.filter(p=>p.customer_id===s.customer_id).map(p=>({value:`id:${p.id}`,label:`Đã có: ${p.date} · vàng ${p.gold}g · công ${p.labor} THB · ${p.id.slice(0,8)}`}))]
    return <div className="ledger-import-group" key={g.id}>
     <Space wrap><Checkbox checked={selected.includes(g.id)} disabled={busy||!!g.errors.length||g.duplicate} onChange={e=>setSelected(previous=>e.target.checked?[...previous,g.id]:previous.filter(id=>id!==g.id))}>{labels[g.kind]} · {g.sheet}: dòng {g.rows.join(', ')}</Checkbox><Tag color={g.errors.length?'red':g.duplicate?'orange':g.possible_duplicate?'gold':'green'}>{g.errors.length?'Lỗi / cần kiểm tra':g.duplicate?'Đã import':g.possible_duplicate?'Có khả năng trùng':'Hợp lệ để kiểm tra'}</Tag><Button danger size="small" disabled={busy} onClick={()=>void skipGroup(g)}>Bỏ qua dòng / nhóm</Button></Space>
     <p>Ngày: {g.date||'Chưa xác định'} · Khách trong file: {g.customer||'Sổ đang mở'} · {g.kind==='PAYMENT'?`Thu ${g.amount||'—'} THB · Người thu: ${g.collector||'—'}`:`Vàng: ${g.gold||'—'} g · Người giao dịch: ${g.employee||'—'}`} {g.kind==='DELIVERY'&&`· Tổng công: ${g.labor} THB`}</p>
     {g.errors.map((text,i)=><Alert key={i} type="error" title={text} />)}
     {g.warnings.map((text,i)=><Alert key={i} type="warning" title={text} />)}
     {selected.includes(g.id)&&missing(g,s).map((text,i)=><Alert key={`missing-${i}`} type="warning" title={text} />)}
     <div className="ledger-import-fields">
      {g.date_row!==undefined&&g.date_column!==undefined&&<label>{g.kind==='PAYMENT'?'Ngày thu tiền':'Ngày giao dịch'}<Input type="date" disabled={busy} key={`${g.id}:${g.date}`} defaultValue={g.date} onBlur={event=>{
       const value=event.target.value
       if(!file||value===g.date)return
       const original=preview.sheets.find(sheet=>sheet.name===g.sheet)?.rows.find(row=>row.row===g.date_row)
       if(!original)return
       const cells=[...(edits.find(edit=>edit.sheet===g.sheet&&edit.row===g.date_row)?.cells??original.cells)]
       cells[g.date_column!]=value
       const next=[...edits.filter(edit=>edit.sheet!==g.sheet||edit.row!==g.date_row),{sheet:g.sheet,row:g.date_row!,cells}]
       void load(file,next,splits)
      }} />{g.date_inherited&&<small>Kế thừa ngày hợp lệ từ dòng {g.date_source_row??'phía trên'}; có thể sửa trước khi import.</small>}</label>}
      {g.type_row!==undefined&&<label>Loại giao dịch<Select disabled={busy} value={preview.transaction_types.some(t=>t.value===g.kind)?g.kind:undefined} placeholder={g.declared_type||'Chọn loại giao dịch'} options={preview.transaction_types} onChange={value=>{
       if(!file)return
       const original=preview.sheets.find(sheet=>sheet.name===g.sheet)?.rows.find(row=>row.row===g.type_row)
       if(!original)return
       const cells=[...(edits.find(edit=>edit.sheet===g.sheet&&edit.row===g.type_row)?.cells??original.cells)]
       cells[customerId?1:2]=value
       const next=[...edits.filter(edit=>edit.sheet!==g.sheet||edit.row!==g.type_row),{sheet:g.sheet,row:g.type_row!,cells}]
       void load(file,next,splits)
      }} /></label>}

      {!customerId&&<label>Khách hàng đích<Select showSearch optionFilterProp="label" allowClear disabled={busy} placeholder="Ghép khách có sẵn / chọn tạo mới" value={s.new_customer_name?'__new':s.customer_id} options={[...choiceOptions(preview.customers),...(can('customers.create')?[{value:'__new',label:'Tạo khách hàng mới sau xác nhận Import'}]:[])]} onChange={id=>{
       setMapping(previous=>Object.fromEntries(Object.entries(previous).map(([key,value])=>{
        const same=preview.groups.find(p=>p.id===key)?.customer===g.customer
        return [key,same?{...value,customer_id:id==='__new'?undefined:id,new_customer_name:id==='__new'?g.customer:undefined}:value]
       })))
      }} /></label>}
      {s.new_customer_name!==undefined&&<label>Tên khách hàng mới<Input disabled={busy} value={s.new_customer_name} onChange={e=>{const value=e.target.value;setMapping(previous=>Object.fromEntries(Object.entries(previous).map(([key,item])=>[key,preview.groups.find(p=>p.id===key)?.customer===g.customer?{...item,new_customer_name:value}:item])))}} /></label>}
      <label>{g.kind==='PAYMENT'?'Người thu':'Người giao dịch'}<Select showSearch optionFilterProp="label" allowClear disabled={busy} value={g.kind==='PAYMENT'?s.collector_id:s.employee_id} options={choiceOptions(preview.employees)} onChange={id=>patch(g.id,{[g.kind==='PAYMENT'?'collector_id':'employee_id']:id})} /></label>
      {g.kind==='PAYMENT'&&<label>Phiếu giao được thanh toán<Select showSearch optionFilterProp="label" allowClear disabled={busy} value={s.payment_target_id?`id:${s.payment_target_id}`:s.payment_target_group?`group:${s.payment_target_group}`:undefined} options={targetOptions} onChange={value=>patch(g.id,{payment_target_id:value?.startsWith('id:')?value.slice(3):undefined,payment_target_group:value?.startsWith('group:')?value.slice(6):undefined})} /></label>}
     </div>
     {g.lines.length>0&&<Table size="small" pagination={false} rowKey="row" scroll={{x:850}} dataSource={g.lines} columns={[
      {title:'Dòng / Chi tiết gốc',render:(_,l)=>`${l.row} · ${l.name}`},
      {title:'SL',dataIndex:'quantity'}, {title:'TL đơn (g)',dataIndex:'unit_weight_g'}, {title:'TL tổng (g)',dataIndex:'total_weight_g'}, {title:'Giá công /15g',dataIndex:'price'}, {title:'Công gốc',dataIndex:'labor'},
      {title:'Mẫu mã đích',width:250,render:(_,l)=><Select style={{width:'100%'}} showSearch optionFilterProp="label" disabled={busy} value={s.models?.find(m=>m.row===l.row)?.model_id} options={choiceOptions(preview.models)} onChange={id=>patch(g.id,{models:g.lines.map(line=>({row:line.row,model_id:line.row===l.row?id:s.models?.find(m=>m.row===line.row)?.model_id}))})} />},
     ]} />}
     {g.note&&<p>Ghi chú: {g.note}</p>}
     <Space wrap><Checkbox disabled={busy} checked={s.allow_possible_duplicate} onChange={e=>patch(g.id,{allow_possible_duplicate:e.target.checked})}>Cho phép giao dịch tương tự sau kiểm tra (không bỏ qua trùng dòng nguồn)</Checkbox></Space>
    </div>
   })}</div>
   {!!preview.ignored.length&&<Collapse items={[{key:'ignored',label:'Các dòng không import',children:<div className="ledger-import-ignored">{preview.ignored.map(row=><p key={`${row.sheet}:${row.row}`}>{row.sheet} · dòng {row.row}: {row.reason} {ignoredRows.some(item=>item.sheet===row.sheet&&item.row===row.row)&&<Button size="small" type="link" disabled={busy} onClick={()=>{if(file)void load(file,edits,splits,ignoredRows.filter(item=>item.sheet!==row.sheet||item.row!==row.row),true)}}>Khôi phục dòng</Button>}</p>)}</div>}]} />}
  </>}
 </Modal>
 <Modal open={!!sourceSheet} title={`Dòng Excel gốc / sửa và tách nhóm: ${sourceSheet}`} width={1200} onCancel={()=>setSourceSheet(undefined)} onOk={()=>{setSourceSheet(undefined);if(file)void load(file,sourceEdits,sourceSplits,sourceIgnoredRows)}} okText="Phân tích lại với sửa đổi" cancelText="Hủy sửa" destroyOnHidden>
  <Alert type="info" title="Sửa dòng nguồn là thao tác có chủ đích; bản gốc vẫn được lưu dấu vết khi import. Tách nhóm chỉ ngắt kế thừa; dòng đầu nhóm mới cần có NGÀY và LOẠI GIAO DỊCH. Ánh xạ nhóm có thể được đặt lại sau phân tích." />
  <Table size="small" pagination={{pageSize:10}} rowKey="row" dataSource={source?.rows} scroll={{x:2700}} columns={[
   {title:'Bỏ qua',width:100,fixed:'left',render:(_,r)=><Checkbox checked={sourceIgnoredRows.some(item=>item.sheet===sourceSheet&&item.row===r.row)} onChange={event=>setSourceIgnoredRows(previous=>event.target.checked?[...previous.filter(item=>item.sheet!==sourceSheet||item.row!==r.row),{sheet:sourceSheet!,row:r.row}]:previous.filter(item=>item.sheet!==sourceSheet||item.row!==r.row))}>Bỏ qua</Checkbox>},
   {title:'Dòng / tách nhóm',width:130,fixed:'left',render:(_,r)=><Checkbox checked={sourceSplits.some(s=>s.sheet===sourceSheet&&s.row===r.row)} onChange={e=>setSourceSplits(previous=>e.target.checked?[...previous,{sheet:sourceSheet!,row:r.row}]:previous.filter(s=>s.sheet!==sourceSheet||s.row!==r.row))}>{r.row}</Checkbox>},
   ...displayHeaders.map((title,index)=>({title,width:155,render:(_:unknown,r:Source)=>{
    const value=sourceEdits.find(e=>e.sheet===sourceSheet&&e.row===r.row)?.cells[index]??r.cells[index]
    const update=(value:string)=>{const cells=[...(sourceEdits.find(edit=>edit.sheet===sourceSheet&&edit.row===r.row)?.cells??r.cells)];cells[index]=value;setSourceEdits(previous=>[...previous.filter(edit=>edit.sheet!==sourceSheet||edit.row!==r.row),{sheet:sourceSheet!,row:r.row,cells}])}
    return title==='LOẠI GIAO DỊCH'?<Select style={{width:'100%'}} allowClear value={value||undefined} options={preview?.transaction_types} onChange={value=>update(value??'')} />:<Input value={value} onChange={e=>update(e.target.value)} />
   }})),
  ]} />
 </Modal>
 </>
}
