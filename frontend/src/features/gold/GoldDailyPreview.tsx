import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Modal, Tag, Typography } from 'antd'
import { usePermissions } from '../auth/hooks/usePermissions'
import { LeftOutlined, RightOutlined, ReloadOutlined, InfoCircleOutlined, SettingOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { GoldScaleTable, GoldBagsTable, GoldLabelsTable, GoldOtherTable, numberOrNull, sumGold, formatGold, NO_BOX_ID, type GoldScaleRow, type GoldAmountRow, type GoldOtherRow } from './GoldDailyTables'
import { GoldWorkerCard, type GoldWorker, type GoldWork } from './GoldWorkerCard'
import { GoldWorkPicker } from './GoldWorkPicker'
import { GOLD_DEMO_PREVIOUS, goldDemoOffset, isGoldDemoDate } from './goldDemoFigures'
import { GoldDaySummary } from './GoldDaySummary'
import { GoldLayoutSettings, type LayoutSaveScope } from './GoldLayoutSettings'
import { INITIAL_GOLD_TEMPLATE, cloneGoldTemplate, effectiveGoldTemplate, upsertTemplateVersion, type GoldLayoutTemplate, type GoldTemplateVersion } from './goldLayoutTemplate'
import './GoldDailyPreview.css'

type GoldDay = {
  workers: GoldWorker[]
  availableWorks: Record<string, GoldWork[]>
  scales: GoldScaleRow[]
  bags: GoldAmountRow[]
  labels: GoldAmountRow[]
  others: GoldOtherRow[]
  debt: string
  previous: string | null
  layout: GoldLayoutTemplate
}
const WORKER_SLOTS = [
  ['nha', 'NHẠ'], ['an', 'AN'], ['binh', 'BÌNH'], ['khoa', 'KHOA'],
  ['hung', 'HÙNG'], ['tuan', 'TUẤN'], ['dung', 'DŨNG'], ['lan', 'LAN'],
] as const
const SAMPLE_WORK: Record<string, GoldWork[]> = {
  nha: [{id:'nha-01',title:'SX-0091 · Chuẩn bị',issued:'200.00',returned:'199.80'},{id:'nha-02',title:'SX-0092 · Chuẩn bị',issued:'200.00',returned:'200.00'},{id:'nha-03',title:'SX-0108 · Chuẩn bị',issued:'75.00'}],
  an: [{id:'an-01',title:'SX-0091 · Hàn',issued:'180.00',returned:'180.25'},{id:'an-02',title:'SX-0093 · Hàn',issued:'120.00',returned:'120.00'},{id:'an-03',title:'SX-0110 · Hàn',issued:'65.00'}],
  binh: [{id:'binh-01',title:'SX-0092 · Lắp ráp',issued:'150.00',returned:'149.75'},{id:'binh-02',title:'SX-0094 · Lắp ráp',issued:'100.00',returned:'100.00'},{id:'binh-03',title:'SX-0112 · Lắp ráp',issued:'90.00'}],
  khoa: [{id:'khoa-01',title:'SX-0095 · Móc xích',issued:'200.00',returned:'200.00'},{id:'khoa-02',title:'SX-0113 · Móc xích',issued:'50.00'}],
  hung: [{id:'hung-01',title:'SX-0096 · Hoàn thiện',issued:'180.00',returned:'180.15'},{id:'hung-02',title:'SX-0114 · Hoàn thiện',issued:'45.00'}],
  tuan: [{id:'tuan-01',title:'SX-0097 · Hàn',issued:'161.88',returned:'161.05'},{id:'tuan-02',title:'SX-0115 · Hàn',issued:'50.00'}],
  dung: [{id:'dung-01',title:'SX-0116 · Chuẩn bị',issued:'85.00'}],
  lan: [{id:'lan-01',title:'SX-0098 · Chuẩn bị',issued:'100.00',returned:'100.00'},{id:'lan-02',title:'SX-0117 · Chuẩn bị',issued:'35.00'}],
}
const SAMPLE_SELECTED_IDS: Record<string,string[]> = {
  nha:['nha-01','nha-02'], an:['an-01','an-02'], binh:['binh-01','binh-02'],
  khoa:['khoa-01'], hung:['hung-01'], tuan:['tuan-01'], dung:[], lan:['lan-01'],
}
const emptyScales = () => Array.from({length:6},():GoldScaleRow=>({box:'',gross:''}))
const emptyOthers = () => Array.from({length:6},():GoldOtherRow=>({name:'',add:'',subtract:''}))
const initialVersions: GoldTemplateVersion[] = [{effectiveFrom:'0001-01-01',template:cloneGoldTemplate(INITIAL_GOLD_TEMPLATE)}]
function demoDay(date:string, template: GoldLayoutTemplate): GoldDay {
  const show = isGoldDemoDate(date)
  return {
    availableWorks: Object.fromEntries(WORKER_SLOTS.map(([id])=>[id,show?(SAMPLE_WORK[id]??[]).map(job=>({...job})):[]])),
    workers: WORKER_SLOTS.map(([id,name])=>({id,name,jobs:show?(SAMPLE_WORK[id]??[]).filter(job=>(SAMPLE_SELECTED_IDS[id]??[]).includes(job.id)).map(job=>({...job})):[]})),
    scales:show?[{box:'box-01',gross:'1690.13'},{box:NO_BOX_ID,gross:'1177.95'},{box:NO_BOX_ID,gross:'1011.21'},...emptyScales().slice(3)]:emptyScales(),
    bags:[...template.bagWeights.map((unit,i)=>({name:'',unit,count:show?String([10,5,3,2,4][i]??''):''})),{name:'',unit:'',count:''}],
    labels:template.labelWeights.map((unit,i)=>({name:'',unit:show?(['0.40','0.80'][i]??unit):unit,count:show?(['10','5'][i]??''):''})),
    others:show?[{name:'Nhận bổ sung',add:'12.50',subtract:''},{name:'Điều chỉnh cân',add:'',subtract:'4.00'},...emptyOthers().slice(2)]:emptyOthers(),
    debt:show?(2450 + goldDemoOffset(date)).toFixed(2):'0.00',
    previous:show?GOLD_DEMO_PREVIOUS.toFixed(2):null,
    layout:cloneGoldTemplate(template),
  }
}
function applyLayout(day: GoldDay, next: GoldLayoutTemplate): GoldDay {
  const oldPresetCount=day.layout.bagWeights.length
  const leftover = day.bags.slice(next.bagWeights.length, oldPresetCount)
    .filter(row => row.count !== '').map(row => ({ ...row, name: row.name || 'Túi ' + row.unit + 'g' }))
  const bags = [
    ...next.bagWeights.map((unit,i)=>({ name:'', unit, count:i < oldPresetCount ? (day.bags[i]?.count ?? '') : '' })),
    ...leftover,
    ...day.bags.slice(oldPresetCount),
  ]
  const labels = [
    ...next.labelWeights.map((unit,i)=>({name:'',unit:unit || day.labels[i]?.unit || '',count:day.labels[i]?.count || ''})),
    ...day.labels.slice(day.layout.labelWeights.length),
  ]
  return {...day, layout:cloneGoldTemplate(next), bags, labels}
}
const dateString = (date:Date) => date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')

export function GoldDailyPreview() {
  const navigate = useNavigate()
  const { date: routeDate } = useParams<{ date: string }>()
  const initialDate = routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate) ? routeDate : dateString(new Date())
  const { can } = usePermissions()
  // Preview approximation only; backend must enforce ADMIN role on persisted defaults.
  const canManageDefaults = can('roles.manage')
  const [date,setDate] = useState(initialDate)
  const [versions,setVersions] = useState<GoldTemplateVersion[]>(initialVersions)
  const [data,setData] = useState<GoldDay>(()=>demoDay(initialDate,INITIAL_GOLD_TEMPLATE))
  const [openedDays,setOpenedDays] = useState<Record<string,GoldDay>>({})
  const [settingsOpen,setSettingsOpen] = useState(false)
  const [debtOpen,setDebtOpen] = useState(false)
  const [pickerWorkerId,setPickerWorkerId] = useState<string | null>(null)
  useEffect(() => {
    if (routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate) && routeDate !== date) {
      setOpenedDays(prev=>({...prev,[date]:data}))
      setDate(routeDate)
      setData(openedDays[routeDate] ?? demoDay(routeDate,effectiveGoldTemplate(versions,routeDate)))
    }
    // Only respond to browser navigation to another day, not local edit activity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDate])
  const changeDate = (next:string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next===date) return
    setOpenedDays(prev=>({...prev,[date]:data}))
    setDate(next)
    setData(openedDays[next] ?? demoDay(next,effectiveGoldTemplate(versions,next)))
    navigate('/gold/daily/' + next)
  }
  const moveDate = (delta:number) => {
    const day=new Date(date+'T12:00:00')
    day.setDate(day.getDate()+delta)
    changeDate(dateString(day))
  }
  const saveLayout = (next:GoldLayoutTemplate,scope:LayoutSaveScope) => {
    if (scope==='future' && !canManageDefaults) return
    if (scope==='future') setVersions(prev=>upsertTemplateVersion(prev,{effectiveFrom:date,template:next}))
    setData(prev=>applyLayout(prev,next))
    setSettingsOpen(false)
  }
  const removeWork = (workerId:string,workId:string) => setData(prev=>({...prev,workers:prev.workers.map(w=>w.id===workerId?{...w,jobs:w.jobs.filter(job=>job.id!==workId)}:w)}))
  const applyWorks = (workerId:string,ids:string[]) => {
    setData(prev=>{
      const selected=new Set(ids)
      const available=prev.availableWorks[workerId] ?? []
      return {...prev,workers:prev.workers.map(w=>w.id===workerId?{...w,jobs:available.filter(job=>selected.has(job.id))}:w)}
    })
    setPickerWorkerId(null)
  }
  const updateScale = (index:number,key:keyof GoldScaleRow,value:string) => setData(prev=>({...prev,scales:prev.scales.map((row,i)=>i===index?{...row,[key]:value}:row)}))
  const updateAmount = (kind:'bags'|'labels',index:number,key:keyof GoldAmountRow,value:string) => setData(prev=>({...prev,[kind]:prev[kind].map((row,i)=>i===index?{...row,[key]:value}:row)}))
  const updateOther = (index:number,key:keyof GoldOtherRow,value:string) => setData(prev=>({...prev,others:prev.others.map((row,i)=>i===index?{...row,[key]:value}:row)}))
  const issued = useMemo(()=>sumGold(data.workers.flatMap(w=>w.jobs.map(job=>numberOrNull(job.issued)))),[data.workers])
  const returned = useMemo(()=>sumGold(data.workers.flatMap(w=>w.jobs.map(job=>numberOrNull(job.returned)))),[data.workers])
  // UI demonstration only; the production API will supply the historical as-of-day balance.
  const workerBalance = issued - returned
  const scale = sumGold(data.scales.map(row=>{
    const gross=numberOrNull(row.gross)
    const tare=row.box===NO_BOX_ID?0:numberOrNull(data.layout.boxes.find(box=>box.id===row.box)?.tareG)
    return gross===null || tare===null?null:gross-tare
  }))
  const bags = sumGold(data.bags.map(r=>r.count===''||r.unit===''?null:(numberOrNull(r.unit)??0)*(numberOrNull(r.count)??0)))
  const labels = sumGold(data.labels.map(r=>r.count===''||r.unit===''?null:(numberOrNull(r.unit)??0)*(numberOrNull(r.count)??0)))
  const pickerWorker = data.workers.find(w=>w.id===pickerWorkerId) ?? null
  const plus = sumGold(data.others.map(r=>numberOrNull(r.add)))
  const minus = sumGold(data.others.map(r=>numberOrNull(r.subtract)))
  return <div className="gold-daily-page">
    <div className="gold-page-heading">
      <div><Button size="small" type="link" icon={<ArrowLeftOutlined/>} onClick={()=>navigate("/gold")}>Danh sách phiên</Button><Typography.Title level={3}>Tịnh vàng hằng ngày</Typography.Title><Typography.Text type="secondary">Sheet vận hành · Trọng lượng (g)</Typography.Text></div>
      <div className="gold-date-controls">
        <Button size="small" aria-label="Ngày trước" onClick={()=>moveDate(-1)} icon={<LeftOutlined/>}/>
        <input className="gold-date-input" type="date" aria-label="Ngày tịnh vàng" value={date} onChange={e=>changeDate(e.target.value)}/>
        <Button size="small" aria-label="Ngày sau" onClick={()=>moveDate(1)} icon={<RightOutlined/>}/>
        <Button size="small" icon={<SettingOutlined/>} onClick={()=>setSettingsOpen(true)}>Thiết lập mẫu</Button>
        <Button size="small" disabled title="Chờ API snapshot từ Sản xuất và Sổ giao dịch khách hàng" icon={<ReloadOutlined/>}>Reload dữ liệu</Button>
        <Tag color="blue">Bản xem trước</Tag>
      </div>
    </div>
    <div className="gold-preview-note"><InfoCircleOutlined/> DỮ LIỆU MẪU: công việc, vàng cân và tổng kết chỉ phục vụ xem giao diện, không phải số liệu đã lưu. Thay đổi sẽ mất khi tải lại trang.</div>
    <div className="gold-page-layout">
      <div className="gold-main-sheet">
        <div className="gold-debt-card">
          <strong>KHÁCH NỢ VÀNG</strong>
          <div className="gold-debt-amount">
            <b>{formatGold(numberOrNull(data.debt),' g')}</b>
            <Button type="link" size="small" onClick={()=>setDebtOpen(true)}>Xem chi tiết ›</Button>
          </div>
        </div>
        <section className="gold-workers-section">
          <div className="gold-workers-heading"><h2>THỢ</h2><div><span>TỔNG GIAO THỢ</span><strong>{formatGold(workerBalance,' g')}</strong></div></div>
          <div className="gold-workers-grid">{data.workers.map(w=><GoldWorkerCard key={w.id} worker={w} onPick={()=>setPickerWorkerId(w.id)} onRemove={workId=>removeWork(w.id,workId)}/>)}</div>
        </section>
        <div className="gold-table-pairs">
          <GoldScaleTable rows={data.scales} boxes={data.layout.boxes} onChange={updateScale} onAdd={()=>setData(p=>({...p,scales:[...p.scales,{box:'',gross:''}]}))}/>
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
    <GoldWorkPicker worker={pickerWorker} available={pickerWorkerId ? (data.availableWorks[pickerWorkerId] ?? []) : []}
      open={pickerWorkerId!==null} onCancel={()=>setPickerWorkerId(null)} onApply={applyWorks}/>
    <GoldLayoutSettings open={settingsOpen} date={date} initial={data.layout} allowFuture={canManageDefaults} onCancel={()=>setSettingsOpen(false)} onSave={saveLayout}/>
    <Modal title="Khách nợ vàng" open={debtOpen} onCancel={()=>setDebtOpen(false)} onOk={()=>setDebtOpen(false)} okText="Đóng" cancelButtonProps={{style:{display:'none'}}}>
      <p>Tổng nợ vàng (dữ liệu mẫu): <strong>{formatGold(numberOrNull(data.debt),' g')}</strong></p>
      <p>Dữ liệu khách hàng chi tiết sẽ lấy từ Sổ giao dịch khách hàng; chưa kết nối API.</p>
    </Modal>

  </div>
}
