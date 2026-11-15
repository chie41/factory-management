import { useMemo, useState } from 'react'
import { Button, Modal, Input, Tag, Typography } from 'antd'
import { LeftOutlined, RightOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { GoldScaleTable, GoldBagsTable, GoldLabelsTable, GoldOtherTable, GoldInput, numberOrNull, sumGold, formatGold, type GoldScaleRow, type GoldAmountRow, type GoldOtherRow } from './GoldDailyTables'
import { GoldWorkerCard, type GoldWorker } from './GoldWorkerCard'
import { GoldDaySummary } from './GoldDaySummary'
import './GoldDailyPreview.css'

type GoldDay = {
  workers: GoldWorker[]
  scales: GoldScaleRow[]
  bags: GoldAmountRow[]
  labels: GoldAmountRow[]
  others: GoldOtherRow[]
  debt: string
  previous: string | null
}
const WORKER_SLOTS = [
  ['nha', 'NHẠ'], ['an', 'AN'], ['binh', 'BÌNH'], ['khoa', 'KHOA'],
  ['hung', 'HÙNG'], ['tuan', 'TUẤN'], ['dung', 'DŨNG'], ['lan', 'LAN'],
] as const
const SAMPLE_WORK: Record<string, GoldWorker['jobs']> = {
  nha: [{title:'SX-0091 · Chuẩn bị',issued:'200.00',returned:'199.80'},{title:'SX-0092 · Chuẩn bị',issued:'200.00',returned:'200.00'}],
  an: [{title:'SX-0091 · Hàn',issued:'180.00',returned:'180.25'},{title:'SX-0093 · Hàn',issued:'120.00',returned:'120.00'}],
  binh: [{title:'SX-0092 · Lắp ráp',issued:'150.00',returned:'149.75'},{title:'SX-0094 · Lắp ráp',issued:'100.00',returned:'100.00'}],
  khoa: [{title:'SX-0095 · Móc xích',issued:'200.00',returned:'200.00'}],
  hung: [{title:'SX-0096 · Hoàn thiện',issued:'180.00',returned:'180.15'}],
  tuan: [{title:'SX-0097 · Hàn',issued:'161.88',returned:'161.05'}],
  lan: [{title:'SX-0098 · Chuẩn bị',issued:'100.00',returned:'100.00'}],
}
const emptyScales = () => Array.from({length:6},():GoldScaleRow=>({box:'',gross:''}))
const emptyLabels = () => Array.from({length:6},():GoldAmountRow=>({name:'',unit:'',count:''}))
const emptyOthers = () => Array.from({length:6},():GoldOtherRow=>({name:'',add:'',subtract:''}))
const bagPresets = ['1.20','1.80','1.60','2.20','0.90']
function demoDay(date:string): GoldDay {
  const show = date==='2026-09-29'
  return {
    workers: WORKER_SLOTS.map(([id,name])=>({id,name,jobs:show?(SAMPLE_WORK[id]??[]):[]})),
    scales:show?[{box:'455.00',gross:'1690.13'},{box:'0.00',gross:'1177.95'},{box:'0.00',gross:'1011.21'},...emptyScales().slice(3)]:emptyScales(),
    bags:[...bagPresets.map((unit,i)=>({name:'',unit,count:show?String([10,5,3,2,4][i]):''})),{name:'',unit:'',count:''}],
    labels:show?[{name:'',unit:'0.40',count:'10'},{name:'',unit:'0.80',count:'5'},...emptyLabels().slice(2)]:emptyLabels(),
    others:show?[{name:'Nhận bổ sung',add:'12.50',subtract:''},{name:'Điều chỉnh cân',add:'',subtract:'4.00'},...emptyOthers().slice(2)]:emptyOthers(),
    debt:show?'2450.00':'0.00',
    previous:show?'9100.00':null,
  }
}
const dateString = (date:Date) => date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')

export function GoldDailyPreview() {
  const [date,setDate] = useState('2026-09-29')
  const [data,setData] = useState<GoldDay>(()=>demoDay('2026-09-29'))
  const [debtOpen,setDebtOpen] = useState(false)
  const [customRow,setCustomRow] = useState<number|null>(null)
  const [customName,setCustomName] = useState('')
  const [customUnit,setCustomUnit] = useState('')
  const changeDate = (next:string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return
    setDate(next)
    setData(demoDay(next))
  }
  const moveDate = (delta:number) => {
    const day=new Date(date+'T12:00:00')
    day.setDate(day.getDate()+delta)
    changeDate(dateString(day))
  }
  const updateScale = (index:number,key:keyof GoldScaleRow,value:string) => setData(prev=>({...prev,scales:prev.scales.map((row,i)=>i===index?{...row,[key]:value}:row)}))
  const updateAmount = (kind:'bags'|'labels',index:number,key:keyof GoldAmountRow,value:string) => setData(prev=>({...prev,[kind]:prev[kind].map((row,i)=>i===index?{...row,[key]:value}:row)}))
  const updateOther = (index:number,key:keyof GoldOtherRow,value:string) => setData(prev=>({...prev,others:prev.others.map((row,i)=>i===index?{...row,[key]:value}:row)}))
  const issued = useMemo(()=>sumGold(data.workers.flatMap(w=>w.jobs.map(job=>numberOrNull(job.issued)))),[data.workers])
  const returned = useMemo(()=>sumGold(data.workers.flatMap(w=>w.jobs.map(job=>numberOrNull(job.returned)))),[data.workers])
  // UI demonstration only; the production API will supply the historical as-of-day balance.
  const workerBalance = issued - returned
  const scale = sumGold(data.scales.map(r=>r.gross===''?null:(numberOrNull(r.gross)??0)-(numberOrNull(r.box)??0)))
  const bags = sumGold(data.bags.map(r=>r.count===''||r.unit===''?null:(numberOrNull(r.unit)??0)*(numberOrNull(r.count)??0)))
  const labels = sumGold(data.labels.map(r=>r.count===''||r.unit===''?null:(numberOrNull(r.unit)??0)*(numberOrNull(r.count)??0)))
  const plus = sumGold(data.others.map(r=>numberOrNull(r.add)))
  const minus = sumGold(data.others.map(r=>numberOrNull(r.subtract)))
  return <div className="gold-daily-page">
    <div className="gold-page-heading">
      <div><Typography.Title level={3}>Tịnh vàng hằng ngày</Typography.Title><Typography.Text type="secondary">Sheet vận hành · Trọng lượng (g)</Typography.Text></div>
      <div className="gold-date-controls">
        <Button size="small" aria-label="Ngày trước" onClick={()=>moveDate(-1)} icon={<LeftOutlined/>}/>
        <input className="gold-date-input" type="date" aria-label="Ngày tịnh vàng" value={date} onChange={e=>changeDate(e.target.value)}/>
        <Button size="small" aria-label="Ngày sau" onClick={()=>moveDate(1)} icon={<RightOutlined/>}/>
        <Button size="small" disabled title="Chờ API snapshot từ Sản xuất và Sổ giao dịch khách hàng" icon={<ReloadOutlined/>}>Reload dữ liệu</Button>
        <Tag color="blue">Bản xem trước</Tag>
      </div>
    </div>
    <div className="gold-preview-note"><InfoCircleOutlined/> Dữ liệu đang hiển thị là mẫu theo Figma; nhập liệu chưa được lưu. Nút Reload sẽ hoạt động sau khi kết nối API snapshot.</div>
    <div className="gold-page-layout">
      <div className="gold-main-sheet">
        <div className="gold-debt-card"><strong>KHÁCH NỢ VÀNG</strong><b>{formatGold(numberOrNull(data.debt),' g')}</b><Button type="link" size="small" onClick={()=>setDebtOpen(true)}>Xem chi tiết ›</Button></div>
        <section className="gold-workers-section">
          <div className="gold-workers-heading"><h2>THỢ</h2><div><span>VÀNG CÒN Ở THỢ CUỐI NGÀY</span><strong>{formatGold(workerBalance,' g')}</strong></div></div>
          <div className="gold-workers-grid">{data.workers.map(w=><GoldWorkerCard key={w.id} worker={w}/>)}</div>
        </section>
        <div className="gold-table-pairs">
          <GoldScaleTable rows={data.scales} onChange={updateScale} onAdd={()=>setData(p=>({...p,scales:[...p.scales,{box:'',gross:''}]}))}/>
          <GoldBagsTable rows={data.bags} onChange={(index,key,value)=>updateAmount('bags',index,key,value)}
            onAdd={()=>setData(p=>({...p,bags:[...p.bags,{name:'',unit:'',count:''}]}))}/>
          <GoldLabelsTable rows={data.labels} onChange={(index,key,value)=>updateAmount('labels',index,key,value)}
            onAdd={()=>setData(p=>({...p,labels:[...p.labels,{name:'',unit:'',count:''}]}))}/>
          <GoldOtherTable rows={data.others} onChange={updateOther}
            onAdd={()=>setData(p=>({...p,others:[...p.others,{name:'',add:'',subtract:''}]}))}/>
        </div>
      </div>
      <GoldDaySummary workerBalance={workerBalance} scale={scale} debt={numberOrNull(data.debt)??0} bags={bags} labels={labels} plus={plus} minus={minus} previous={numberOrNull(data.previous)}/>
    </div>
    <Modal title="Khách nợ vàng" open={debtOpen} onCancel={()=>setDebtOpen(false)} onOk={()=>setDebtOpen(false)} okText="Đóng" cancelButtonProps={{style:{display:'none'}}}>
      <p>Tổng nợ vàng (dữ liệu mẫu): <strong>{formatGold(numberOrNull(data.debt),' g')}</strong></p>
      <p>Dữ liệu khách hàng chi tiết sẽ lấy từ Sổ giao dịch khách hàng; chưa kết nối API.</p>
    </Modal>
    <Modal title="Thêm phụ liệu tùy chỉnh" open={customRow!==null} onCancel={()=>setCustomRow(null)} onOk={()=>{
      if(customRow==null||!customName.trim()||!customUnit)return
      setData(p=>({...p,bags:p.bags.map((row,i)=>i===customRow?{...row,name:customName,unit:customUnit}:row)}))
      setCustomRow(null)
    }} okText="Lưu" okButtonProps={{disabled:!customName.trim()||!customUnit}}>
      <div className="gold-custom-fields"><label>Loại / tên<Input value={customName} onChange={e=>setCustomName(e.target.value)}/></label><label>Trọng lượng đơn (g)<GoldInput value={customUnit} onChange={setCustomUnit}/></label></div>
    </Modal>
  </div>
}
