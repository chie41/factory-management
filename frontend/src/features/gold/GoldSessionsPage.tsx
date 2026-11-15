import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { goldSessionApi, type GoldSessionListRow } from './goldSessionApi'
import { Alert, Button, Empty, Select, Table, Tag, Typography, message } from 'antd'
import { CalendarOutlined, LeftOutlined, RightOutlined, EyeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import './GoldSessionsPage.css'
import { goldDemoDifference, goldDemoTotal } from './goldDemoFigures'

type GoldSessionStatus = 'DRAFT' | 'FINALIZED' | 'LOCKED' | 'REOPENED'
type GoldSessionListItem = {
  id: string
  sessionDate: string
  finalizedAt: string | null
  operatorName: string | null
  totalGoldG: string | null
  differenceG: string | null
  status: GoldSessionStatus
}
const STATUS_LABEL: Record<GoldSessionStatus, string> = {
  DRAFT: 'Đang nhập',
  FINALIZED: 'Đã chốt',
  LOCKED: 'Đã khóa',
  REOPENED: 'Được mở lại',
}
const STATUS_COLOR: Record<GoldSessionStatus, string> = {
  DRAFT: 'processing',
  FINALIZED: 'success',
  LOCKED: 'default',
  REOPENED: 'warning',
}
function isoLocalDate(date: Date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}
function monthShift(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + offset, 1)
  return isoLocalDate(date).slice(0, 7)
}
function formatDate(date: string) {
  const [year, month, day] = date.split('-')
  return day + '/' + month + '/' + year
}
const formatGrams = (value: string | null) =>
  value === null ? '—' : Number(value).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' g'

/** Presentation-only records for reviewing the list UI.
 * Never persist, export as real sessions, or mix with API data.
 */
function createPreviewSessions(month: string): GoldSessionListItem[] {
  const today = new Date()
  const [year, monthNumber] = month.split('-').map(Number)
  const endDay = month === isoLocalDate(today).slice(0, 7)
    ? today.getDate()
    : new Date(year, monthNumber, 0).getDate()
  const days = Array.from({length: Math.min(12, endDay)}, (_, i) => endDay - i)
  const statuses: GoldSessionStatus[] = ['DRAFT', 'LOCKED', 'FINALIZED', 'LOCKED', 'FINALIZED', 'REOPENED', 'LOCKED', 'FINALIZED', 'LOCKED', 'FINALIZED', 'LOCKED', 'FINALIZED']
  return days.map((day, i) => {
    const sessionDate = month + '-' + String(day).padStart(2, '0')
    return {
      id: 'demo-' + sessionDate,
      sessionDate,
      finalizedAt: statuses[i] === 'DRAFT' ? null : sessionDate + 'T' + String(17 + (i % 4)).padStart(2, '0') + ':30:00',
      operatorName: ['Nguyễn Văn An', 'Trần Thị Lan', 'Phạm Minh Anh'][i % 3],
      totalGoldG: goldDemoTotal(sessionDate),
      differenceG: goldDemoDifference(sessionDate),
      status: statuses[i],
    }
  })
}

export function GoldSessionsPage() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(() => isoLocalDate(new Date()).slice(0,7))
  const [status, setStatus] = useState<GoldSessionStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [demoMode,setDemoMode] = useState(false)
  const [creating,setCreating] = useState(false)
  const queryClient = useQueryClient()
  const currentMonth = isoLocalDate(new Date()).slice(0,7)
  const sessions = useQuery({queryKey:['gold-refining-sessions',month],queryFn:()=>goldSessionApi.list(month),enabled:!demoMode})
  const realRows: GoldSessionListItem[] = (sessions.data??[]).map((item:GoldSessionListRow)=>({
    id:item.id,sessionDate:item.session_date,
    finalizedAt:item.finalized_at,operatorName:item.operator_name,
    totalGoldG:item.total_gold_g,differenceG:item.difference_g,status:item.status,
  }))
  const filtered = useMemo(() => (demoMode?createPreviewSessions(month):realRows).filter(row =>
    row.sessionDate.startsWith(month) && (status === 'ALL' || row.status === status)
  ), [month, status, demoMode, sessions.data])
  const createSession = async () => {
    const date=isoLocalDate(new Date())
    setCreating(true)
    try {
      await goldSessionApi.create(date)
      await queryClient.invalidateQueries({queryKey:['gold-refining-sessions']})
      navigate('/gold/daily/'+date)
    } catch(error) {
      const existing=await goldSessionApi.byDate(date).catch(()=>null)
      if(existing) navigate('/gold/daily/'+date)
      else message.error('Không tạo được phiên. Kiểm tra quyền và migration backend.')
    } finally {setCreating(false)}
  }
  const setSelectedMonth = (next: string) => {
    if (!/^\d{4}-\d{2}$/.test(next)) return
    setMonth(next)
    setPage(1)
  }
  return <div className="gold-sessions-page">
    <div className="gold-sessions-title">
      <div>
        <Typography.Title level={3}>Phiên tịnh vàng</Typography.Title>
        <Typography.Text type="secondary">Danh sách và lịch sử các phiên tịnh vàng hằng ngày</Typography.Text>
      </div>
      <Button type="primary" loading={creating} onClick={() => void createSession()}>Tạo phiên tịnh vàng mới</Button>
    </div>
    <div className="gold-sessions-filter">
      <div className="gold-sessions-month">
        <CalendarOutlined />
        <Button size="small" type={month===currentMonth?'primary':'default'} onClick={() => setSelectedMonth(currentMonth)}>Tháng này</Button>
        <Button size="small" aria-label="Tháng trước" icon={<LeftOutlined />} onClick={() => setSelectedMonth(monthShift(month,-1))} />
        <input type="month" aria-label="Lọc theo tháng" value={month} onChange={e => setSelectedMonth(e.target.value)} />
        <Button size="small" aria-label="Tháng sau" icon={<RightOutlined />} onClick={() => setSelectedMonth(monthShift(month,1))} />
      </div>
      <Button size="small" onClick={()=>{setDemoMode(!demoMode);setPage(1)}}>{demoMode?'Xem phiên thật':'Xem dữ liệu mẫu'}</Button>
      <Select<GoldSessionStatus | 'ALL'> aria-label="Lọc trạng thái" value={status} style={{width:168}}
        onChange={next=>{setStatus(next);setPage(1)}} options={[
          {value:'ALL',label:'Tất cả trạng thái'},
          {value:'DRAFT',label:'Đang nhập'},
          {value:'FINALIZED',label:'Đã chốt'},
          {value:'LOCKED',label:'Đã khóa'},
          {value:'REOPENED',label:'Được mở lại'},
        ]}/>
    </div>
    {!demoMode && sessions.isError && <Alert style={{marginBottom:12}} type="warning" showIcon
      title="Chưa tải được danh sách phiên thật"
      description="Kiểm tra backend, migration và quyền gold.sessions.read. Có thể chọn Xem dữ liệu mẫu để kiểm tra giao diện."
      action={<Button size="small" onClick={()=>void sessions.refetch()}>Thử lại</Button>} />}
    <div className="gold-sessions-table">
      <div className="gold-sessions-table-heading">
        <strong>Danh sách phiên {demoMode && <Tag color="orange">DỮ LIỆU MẪU</Tag>}</strong>
        <span>Tháng {month.slice(5,7)}/{month.slice(0,4)}</span>
      </div>
      <Table<GoldSessionListItem>
        rowKey="id"
        size="middle"
        dataSource={filtered}
        loading={!demoMode && sessions.isFetching}
        scroll={{x:950}}
        pagination={{current:page,pageSize:15,total:filtered.length,hideOnSinglePage:true,onChange:setPage}}
        locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span>{demoMode?'Không có phiên mẫu trong bộ lọc này.':'Chưa có phiên tịnh vàng nào được lưu trong tháng này.'}<br/>Bộ lọc đang chọn: tháng {month.slice(5,7)}/{month.slice(0,4)}.</span>}>
          <Button onClick={()=>{setDemoMode(true);setPage(1)}}>Xem dữ liệu mẫu</Button>
        </Empty>}}
        columns={[
          {title:'Ngày tịnh',dataIndex:'sessionDate',width:145,render:(date:string)=><span>{formatDate(date)} {demoMode && <Tag style={{marginLeft:4}}>Mẫu</Tag>}</span>},
          {title:'Thời gian chốt',dataIndex:'finalizedAt',width:160,render:(value:string|null)=>value?formatDate(value.slice(0,10))+' '+value.slice(11,16):'—'},
          {title:'Người thực hiện',dataIndex:'operatorName',width:170,render:(value:string|null)=>value??'—'},
          {title:'Tổng vàng tịnh được',dataIndex:'totalGoldG',width:180,align:'right',render:formatGrams},
          {title:'Chênh lệch',dataIndex:'differenceG',width:140,align:'right',render:(v:string|null)=><span style={{color:v && Number(v)<0?'#cf1322':undefined}}>{v && Number(v)>0?'+':''}{formatGrams(v)}</span>},
          {title:'Trạng thái',dataIndex:'status',width:150,render:(value:GoldSessionStatus)=><Tag color={STATUS_COLOR[value]}>{STATUS_LABEL[value]}</Tag>},
          {title:'',key:'action',width:120,render:(_,row)=><Button type="link" icon={<EyeOutlined/>} onClick={()=>navigate('/gold/daily/'+row.sessionDate+(demoMode?'?demo=1':''))}>{demoMode?'Xem mẫu':'Chi tiết'}</Button>},
        ]}
      />
    </div>
    <div className="gold-sessions-preview-note">{demoMode?'Chế độ xem dữ liệu mẫu: các dòng chỉ minh họa, không lưu database.':'Chế độ dữ liệu thực: các phiên được tải từ backend; tạo phiên mới sẽ lưu vào database.'}</div>
  </div>
}
