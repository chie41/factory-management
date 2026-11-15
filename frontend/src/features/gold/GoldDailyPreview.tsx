import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { goldSessionApi, type GoldSession, type GoldCustomerDebt } from './goldSessionApi'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Input, Modal, Table, Tag, Typography, message } from 'antd'
import { usePermissions } from '../auth/hooks/usePermissions'
import { LeftOutlined, RightOutlined, ReloadOutlined, InfoCircleOutlined, SettingOutlined, ArrowLeftOutlined, SaveOutlined, UnlockOutlined } from '@ant-design/icons'
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
  customerDebts: GoldCustomerDebt[]
  previous: string | null
  layout: GoldLayoutTemplate
}
const WORKER_SLOTS = [
  ['nha', 'NHẠ'], ['an', 'AN'], ['binh', 'BÌNH'], ['khoa', 'KHOA'],
  ['hung', 'HÙNG'], ['tuan', 'TUẤN'], ['dung', 'DŨNG'], ['lan', 'LAN'],
] as const
const SAMPLE_WORK: Record<string, Omit<GoldWork, 'workDate'>[]> = {
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
function sampleWorkFor(workerId: string, sessionDate: string): GoldWork[] {
  return (SAMPLE_WORK[workerId] ?? []).map((job, index) => {
    const day = new Date(sessionDate + 'T12:00:00')
    day.setDate(day.getDate() - (index % 3))
    return { ...job, workDate: dateString(day) }
  })
}
function demoDay(date:string, template: GoldLayoutTemplate): GoldDay {
  const show = isGoldDemoDate(date)
  return {
    availableWorks: Object.fromEntries(WORKER_SLOTS.map(([id])=>[id,show?sampleWorkFor(id,date):[]])),
    workers: WORKER_SLOTS.map(([id,name])=>({id,name,jobs:show?sampleWorkFor(id,date).filter(job=>(SAMPLE_SELECTED_IDS[id]??[]).includes(job.id)):[]})),
    scales:show?[{box:'box-01',gross:'1690.13'},{box:NO_BOX_ID,gross:'1177.95'},{box:NO_BOX_ID,gross:'1011.21'},...emptyScales().slice(3)]:emptyScales(),
    bags:[...template.bagWeights.map((unit,i)=>({name:'',unit,count:show?String([10,5,3,2,4][i]??''):''})),{name:'',unit:'',count:''}],
    labels:template.labelWeights.map((unit,i)=>({name:'',unit:show?(['0.40','0.80'][i]??unit):unit,count:show?(['10','5'][i]??''):''})),
    others:show?[{name:'Nhận bổ sung',add:'12.50',subtract:''},{name:'Điều chỉnh cân',add:'',subtract:'4.00'},...emptyOthers().slice(2)]:emptyOthers(),
    debt:show?(2450 + goldDemoOffset(date)).toFixed(2):'0.00',
    customerDebts:[],
    previous:show?GOLD_DEMO_PREVIOUS.toFixed(2):null,
    layout:cloneGoldTemplate(template),
  }
}
function fromSession(session:GoldSession):GoldDay {
  const selected = new Set(session.selected_work_ids)
  const availableWorks = Object.fromEntries(session.source_snapshot.workers.map(w=>[w.id,w.jobs]))
  return {
    workers: session.source_snapshot.workers.map(w=>({...w,jobs:w.jobs.filter(job=>selected.has(job.id))})),
    availableWorks,
    scales:session.manual_entries.scales,
    bags:session.manual_entries.bags,
    labels:session.manual_entries.labels,
    others:session.manual_entries.others,
    debt:session.source_snapshot.customerDebt,
    customerDebts:session.source_snapshot.customerDebts ?? [],
    previous:session.totals_snapshot?.previous_gold_g??null,
    layout:session.layout_snapshot,
  }
}
function manualFromDay(day:GoldDay) {
  return {scales:day.scales,bags:day.bags,labels:day.labels,others:day.others}
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
  const location = useLocation()
  const isDemo = new URLSearchParams(location.search).get('demo')==='1'
  const queryClient = useQueryClient()
  const { date: routeDate } = useParams<{ date: string }>()
  const initialDate = routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate) ? routeDate : dateString(new Date())
  const { can } = usePermissions()
  // Preview approximation only; backend must enforce ADMIN role on persisted defaults.
  const canManageDefaults = can('gold.templates.manage')
  const canEdit = can('gold.sessions.edit')
  const canFinalize = can('gold.sessions.finalize')
  const canReopen = can('gold.sessions.reopen')
  const [date,setDate] = useState(initialDate)
  const [versions,setVersions] = useState<GoldTemplateVersion[]>(initialVersions)
  const [data,setData] = useState<GoldDay>(()=>demoDay(isDemo?initialDate:'1000-01-01',INITIAL_GOLD_TEMPLATE))
  const [openedDays,setOpenedDays] = useState<Record<string,GoldDay>>({})
  const [settingsOpen,setSettingsOpen] = useState(false)
  const [debtOpen,setDebtOpen] = useState(false)
  const [pickerWorkerId,setPickerWorkerId] = useState<string | null>(null)
  const [busy,setBusy] = useState(false)
  const [reopenOpen,setReopenOpen] = useState(false)
  const [reopenReason,setReopenReason] = useState('')
  const [pendingRemove,setPendingRemove] = useState<{workerId:string;workId:string} | null>(null)
  const query = useQuery({
    queryKey:['gold-refining-by-date',date],
    queryFn:()=>goldSessionApi.byDate(date),
    enabled:!isDemo,
    staleTime:0,
  })
  const session = query.data
  const isEditable = isDemo || (session && (session.status==='DRAFT'||session.status==='REOPENED') && canEdit)
  useEffect(() => {
    if(isDemo){setData(demoDay(date,effectiveGoldTemplate(versions,date)));return}
    if(session){setData(fromSession(session))}
    else if(!query.isFetching&&!query.isPending){setData(demoDay('1000-01-01',INITIAL_GOLD_TEMPLATE))}
    // Session versions are authoritative; local changes remain until a server update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isDemo,session?.id,session?.version])
  const applyServerSession = (updated:GoldSession) => {
    queryClient.setQueryData(['gold-refining-by-date',updated.business_date],updated)
    setData(fromSession(updated))
    void queryClient.invalidateQueries({queryKey:['gold-refining-sessions']})
  }
  const createReal = async () => {
    if(isDemo || !canEdit) return
    setBusy(true)
    try {
      const created=await goldSessionApi.create(date)
      applyServerSession(created)
      message.success('Đã tạo phiên Tịnh vàng')
    } catch {
      message.error('Không tạo được phiên. Có thể ngày này đã có phiên khác hoặc chưa được cấp quyền.')
      void query.refetch()
    } finally {setBusy(false)}
  }
  const saveReal = async (nextDay=data) => {
    if(isDemo || !session || !isEditable) return null
    const result=await goldSessionApi.save(session,manualFromDay(nextDay),
      nextDay.workers.flatMap(w=>w.jobs.map(job=>job.id)),nextDay.layout)
    applyServerSession(result)
    return result
  }
  const saveDraft = async () => {
    setBusy(true)
    try {
      const saved=await saveReal()
      if(saved)message.success('Đã lưu phiên')
    }catch {message.error('Không lưu được phiên. Kiểm tra dữ liệu và phiên bản mới nhất.');void query.refetch()}
    finally {setBusy(false)}
  }
  const reloadReal = () => {
    if(isDemo || !session || !isEditable)return
    Modal.confirm({
      title:'Reload dữ liệu Sản xuất và Khách nợ',
      content:'Nguồn dữ liệu sẽ được chụp lại tại thời điểm reload. Các ô cân/túi/nhãn/khác đã lưu được giữ nguyên; công việc không còn trong nguồn có thể bị bỏ chọn. Hãy lưu nháp trước khi reload nếu đang nhập dở.',
      okText:'Reload dữ liệu',cancelText:'Hủy',
      onOk:async()=>{
        try{
          const response=await goldSessionApi.reload(session)
          applyServerSession(response.data)
          if(response.warnings?.removedWorkIds?.length) message.warning('Một số công việc không còn trong nguồn đã bị bỏ chọn. Vui lòng kiểm tra lại.')
          else message.success('Đã cập nhật snapshot dữ liệu')
        }catch{message.error('Không reload được. Kiểm tra quyền hoặc phiên bản hiện tại.');void query.refetch()}
      },
    })
  }
  const finalizeReal = () => {
    if(isDemo || !session || !canFinalize || !isEditable)return
    Modal.confirm({
      title:'Xác nhận chốt phiên Tịnh vàng',
      content:'Hệ thống sẽ lưu số liệu đang nhập, tính lại tổng và chốt phiên. Sau thời gian khóa, chỉ Admin mới được mở lại.',
      okText:'Chốt phiên',cancelText:'Hủy',
      onOk:async()=>{
        setBusy(true)
        try{
          const saved=await saveReal()
          if(!saved)return
          const finalized=await goldSessionApi.finalize(saved)
          applyServerSession(finalized)
          message.success('Đã chốt phiên Tịnh vàng')
        }catch{message.error('Không chốt được phiên. Kiểm tra ô nhập và tải lại để tránh ghi đè.');void query.refetch()}
        finally{setBusy(false)}
      },
    })
  }
  const reopenReal = async()=>{
    if(isDemo || !session || !canReopen || reopenReason.trim().length<8)return
    setBusy(true)
    try{
      const updated=await goldSessionApi.reopen(session,reopenReason.trim())
      applyServerSession(updated)
      setReopenOpen(false)
      setReopenReason('')
      message.success('Đã mở lại phiên')
    }catch{message.error('Không mở lại được. Kiểm tra quyền Admin và phiên bản.');void query.refetch()}
    finally{setBusy(false)}
  }
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
    setData(isDemo ? (openedDays[next] ?? demoDay(next,effectiveGoldTemplate(versions,next))) : demoDay('1000-01-01',INITIAL_GOLD_TEMPLATE))
    navigate('/gold/daily/' + next + (isDemo?'?demo=1':''))
  }
  const moveDate = (delta:number) => {
    const day=new Date(date+'T12:00:00')
    day.setDate(day.getDate()+delta)
    changeDate(dateString(day))
  }
  const saveLayout = async (next:GoldLayoutTemplate,scope:LayoutSaveScope) => {
    if (scope==='future' && !canManageDefaults) return
    if (!isDemo && (!session || !isEditable)) {message.error('Phiên không cho phép sửa cấu hình.');return}
    setBusy(true)
    try {
      if(scope==='future'){
        if(!isDemo)await goldSessionApi.saveDefaultTemplate(date,next)
        setVersions(prev=>upsertTemplateVersion(prev,{effectiveFrom:date,template:next}))
      }
      const nextDay=applyLayout(data,next)
      if(isDemo) setData(nextDay)
      else await saveReal(nextDay)
      setSettingsOpen(false)
      if(!isDemo)message.success('Đã lưu thiết lập mẫu')
    }catch {message.error('Không lưu được thiết lập; dữ liệu chưa thay đổi trên máy chủ.');void query.refetch()}
    finally{setBusy(false)}
  }
  const confirmRemoveWork = () => {
    if (!pendingRemove) return
    const {workerId,workId} = pendingRemove
    setData(prev=>({...prev,workers:prev.workers.map(w=>w.id===workerId?{...w,jobs:w.jobs.filter(job=>job.id!==workId)}:w)}))
    setPendingRemove(null)
  }
  const pendingWorker = data.workers.find(w=>w.id===pendingRemove?.workerId)
  const pendingJob = pendingWorker?.jobs.find(job=>job.id===pendingRemove?.workId)
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
        <Button size="small" icon={<SettingOutlined/>} disabled={!isEditable||busy} onClick={()=>setSettingsOpen(true)}>Thiết lập mẫu</Button>
        <Button size="small" disabled={!isEditable||isDemo||busy} icon={<ReloadOutlined/>} onClick={reloadReal}>Reload dữ liệu</Button>
        {!isDemo && session && isEditable && <Button type="primary" size="small" loading={busy} icon={<SaveOutlined/>} onClick={()=>void saveDraft()}>Lưu nháp</Button>}
        {!isDemo && !session && canEdit && <Button type="primary" size="small" loading={busy} onClick={()=>void createReal()}>Bắt đầu phiên</Button>}
        {!isDemo && session && (session.status==='LOCKED'||session.status==='FINALIZED') && canReopen && <Button size="small" icon={<UnlockOutlined/>} onClick={()=>setReopenOpen(true)}>Mở lại phiên</Button>}
        <Tag color={isDemo?'orange':session?.status==='LOCKED'?'default':session?.status==='FINALIZED'?'green':'blue'}>{isDemo?'Dữ liệu mẫu':session?({DRAFT:'Đang nhập',FINALIZED:'Đã chốt',LOCKED:'Đã khóa',REOPENED:'Đã mở lại'}[session.status]):'Chưa có phiên'}</Tag>
      </div>
    </div>
    {isDemo ? <div className="gold-preview-note"><InfoCircleOutlined/> DỮ LIỆU MẪU — không lưu database. Thoát và mở lại để xem phiên thực.</div>
      : <div className="gold-preview-note"><InfoCircleOutlined/> Phiên thực sử dụng snapshot từ Sản xuất và Sổ khách hàng. Nhấn Lưu nháp sau khi sửa; nguồn không tự đổi.</div>}
    {!isDemo && query.isError && <Alert type="error" style={{marginBottom:12}} title="Không tải được phiên Tịnh vàng" description="Kiểm tra backend, migration và quyền gold.sessions.read." />}
    {!isDemo && !session && !query.isFetching && !query.isError && <Alert type="info" style={{marginBottom:12}} title="Ngày này chưa có phiên Tịnh vàng" description="Nhấn Bắt đầu phiên để tạo và lấy dữ liệu." />}
    {!isDemo && session && !isEditable && <Alert type="warning" style={{marginBottom:12}} title="Phiên đang ở chế độ chỉ đọc" description="Phiên đã chốt/khóa. Chỉ Admin có quyền mở lại." />}
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
          <div className="gold-workers-grid">{data.workers.map(w=><GoldWorkerCard key={w.id} worker={w} disabled={!isEditable} onPick={()=>setPickerWorkerId(w.id)} onRemove={workId=>setPendingRemove({workerId:w.id,workId})}/>)}</div>
          {data.workers.length===0 && <div className="gold-no-workers">Chưa có công việc thợ trong snapshot của phiên này.</div>}
        </section>
        <div className="gold-table-pairs">
          <GoldScaleTable rows={data.scales} boxes={data.layout.boxes} disabled={!isEditable} onChange={updateScale} onAdd={()=>setData(p=>({...p,scales:[...p.scales,{box:'',gross:''}]}))}/>
          <GoldBagsTable rows={data.bags} disabled={!isEditable} onChange={(index,key,value)=>updateAmount('bags',index,key,value)}
            onAdd={()=>setData(p=>({...p,bags:[...p.bags,{name:'',unit:'',count:''}]}))}/>
          <GoldLabelsTable rows={data.labels} disabled={!isEditable} onChange={(index,key,value)=>updateAmount('labels',index,key,value)}
            onAdd={()=>setData(p=>({...p,labels:[...p.labels,{name:'',unit:'',count:''}]}))}/>
          <GoldOtherTable rows={data.others} disabled={!isEditable} onChange={updateOther}
            onAdd={()=>setData(p=>({...p,others:[...p.others,{name:'',add:'',subtract:''}]}))}/>
        </div>
      </div>
      <GoldDaySummary workerBalance={workerBalance} scale={scale} debt={numberOrNull(data.debt)??0} bags={bags} labels={labels} plus={plus} minus={minus} previous={numberOrNull(data.previous)} onFinalize={finalizeReal} finalizeDisabled={!session || !isEditable || !canFinalize || isDemo || busy} finalizeBusy={busy}/>
    </div>
    <Modal title="Xác nhận bỏ công việc" open={pendingRemove!==null}
      okText="Bỏ công việc" okButtonProps={{danger:true}}
      cancelText="Hủy" onCancel={()=>setPendingRemove(null)} onOk={confirmRemoveWork}
      destroyOnHidden>
      <p>Bạn có chắc muốn bỏ <strong>{pendingJob?.title ?? 'công việc này'}</strong> khỏi bảng Tịnh vàng của thợ <strong>{pendingWorker?.name ?? ''}</strong>?</p>
      <p>Thao tác này chỉ loại công việc khỏi phiên Tịnh vàng đang xem, <strong>không xóa công việc hoặc dữ liệu giao nhận trong Sản xuất</strong>. Tổng giao thợ và Tổng kết ngày sẽ được tính lại.</p>
    </Modal>
    <Modal open={reopenOpen} title="Mở lại phiên Tịnh vàng" okText="Mở lại phiên" okButtonProps={{disabled:reopenReason.trim().length<8,loading:busy}} onOk={()=>void reopenReal()} onCancel={()=>setReopenOpen(false)}>
      <p>Nhập lý do mở lại phiên (tối thiểu 8 ký tự). Thao tác được ghi nhận trong lịch sử.</p>
      <Input.TextArea rows={3} value={reopenReason} onChange={e=>setReopenReason(e.target.value)} placeholder="Lý do mở lại..."/>
    </Modal>
    <GoldWorkPicker worker={pickerWorker} available={pickerWorkerId ? (data.availableWorks[pickerWorkerId] ?? []) : []}
      open={pickerWorkerId!==null} onCancel={()=>setPickerWorkerId(null)} onApply={applyWorks}/>
    <GoldLayoutSettings open={settingsOpen} date={date} initial={data.layout} allowFuture={canManageDefaults} onCancel={()=>setSettingsOpen(false)} onSave={saveLayout}/>
    <Modal title="Khách nợ vàng" open={debtOpen} onCancel={()=>setDebtOpen(false)} onOk={()=>setDebtOpen(false)} okText="Đóng" cancelButtonProps={{style:{display:'none'}}}>
      <p>Tổng nợ vàng theo snapshot: <strong>{formatGold(numberOrNull(data.debt),' g')}</strong></p>
      {isDemo ? <p>Đây là số tổng minh họa. Dữ liệu mẫu chưa có danh sách khách hàng.</p>
      : <Table<GoldCustomerDebt> size="small" rowKey="customerId" dataSource={data.customerDebts} pagination={false}
        scroll={{y:360}} locale={{emptyText:'Không có khách hàng nợ vàng dương tại ngày tịnh'}}
        columns={[
          {title:'Mã KH',dataIndex:'customerCode',width:100},
          {title:'Khách hàng',dataIndex:'customerName'},
          {title:'Nợ vàng (g)',dataIndex:'closingGoldG',width:140,align:'right',render:(v:string)=>formatGold(numberOrNull(v))},
        ]}/>}
      <p style={{marginTop:12,color:'#667085',fontSize:12}}>Các khoản nợ dương được tính theo sổ khách hàng đến cuối ngày {date}, giữ nguyên trong snapshot cho đến khi Reload dữ liệu.</p>
    </Modal>

  </div>
}
