import { useMemo, useState } from 'react'
import { Button, Empty, Select, Table, Tag, Typography } from 'antd'
import { CalendarOutlined, LeftOutlined, RightOutlined, EyeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import './GoldSessionsPage.css'

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

/** Empty until the real gold-refining session API is implemented.
 * Do not derive "saved sessions" from a UI preview or from production transactions.
 */
const PREVIEW_SESSIONS: GoldSessionListItem[] = []

export function GoldSessionsPage() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(() => isoLocalDate(new Date()).slice(0,7))
  const [status, setStatus] = useState<GoldSessionStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const currentMonth = isoLocalDate(new Date()).slice(0,7)
  const filtered = useMemo(() => PREVIEW_SESSIONS.filter(row =>
    row.sessionDate.startsWith(month) && (status === 'ALL' || row.status === status)
  ), [month, status])
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
      <Button type="primary" onClick={() => navigate('/gold/daily/' + isoLocalDate(new Date()))}>Mở trang tịnh vàng</Button>
    </div>
    <div className="gold-sessions-filter">
      <div className="gold-sessions-month">
        <CalendarOutlined />
        <Button size="small" type={month===currentMonth?'primary':'default'} onClick={() => setSelectedMonth(currentMonth)}>Tháng này</Button>
        <Button size="small" aria-label="Tháng trước" icon={<LeftOutlined />} onClick={() => setSelectedMonth(monthShift(month,-1))} />
        <input type="month" aria-label="Lọc theo tháng" value={month} onChange={e => setSelectedMonth(e.target.value)} />
        <Button size="small" aria-label="Tháng sau" icon={<RightOutlined />} onClick={() => setSelectedMonth(monthShift(month,1))} />
      </div>
      <Select<GoldSessionStatus | 'ALL'> aria-label="Lọc trạng thái" value={status} style={{width:168}}
        onChange={next=>{setStatus(next);setPage(1)}} options={[
          {value:'ALL',label:'Tất cả trạng thái'},
          {value:'DRAFT',label:'Đang nhập'},
          {value:'FINALIZED',label:'Đã chốt'},
          {value:'LOCKED',label:'Đã khóa'},
          {value:'REOPENED',label:'Được mở lại'},
        ]}/>
    </div>
    <div className="gold-sessions-table">
      <div className="gold-sessions-table-heading">
        <strong>Danh sách phiên</strong>
        <span>Tháng {month.slice(5,7)}/{month.slice(0,4)}</span>
      </div>
      <Table<GoldSessionListItem>
        rowKey="id"
        size="middle"
        dataSource={filtered}
        scroll={{x:950}}
        pagination={{current:page,pageSize:15,total:filtered.length,hideOnSinglePage:true,onChange:setPage}}
        locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span>Chưa có dữ liệu phiên tịnh vàng từ máy chủ.<br/>Bộ lọc đang chọn: tháng {month.slice(5,7)}/{month.slice(0,4)}.</span>}>
          <Button onClick={()=>navigate('/gold/daily/2026-09-29')}>Xem biểu mẫu mẫu ngày 29/09/2026</Button>
        </Empty>}}
        columns={[
          {title:'Ngày tịnh',dataIndex:'sessionDate',width:145,render:(date:string)=>formatDate(date)},
          {title:'Thời gian chốt',dataIndex:'finalizedAt',width:160,render:(value:string|null)=>value?new Date(value).toLocaleString('vi-VN'):'—'},
          {title:'Người thực hiện',dataIndex:'operatorName',width:170,render:(value:string|null)=>value??'—'},
          {title:'Tổng vàng tịnh được',dataIndex:'totalGoldG',width:180,align:'right',render:formatGrams},
          {title:'Chênh lệch',dataIndex:'differenceG',width:140,align:'right',render:formatGrams},
          {title:'Trạng thái',dataIndex:'status',width:150,render:(value:GoldSessionStatus)=><Tag color={STATUS_COLOR[value]}>{STATUS_LABEL[value]}</Tag>},
          {title:'',key:'action',width:120,render:(_,row)=><Button type="link" icon={<EyeOutlined/>} onClick={()=>navigate('/gold/daily/'+row.sessionDate)}>Chi tiết</Button>},
        ]}
      />
    </div>
    <div className="gold-sessions-preview-note">Đây là bản xem trước của trang danh sách. API lưu phiên, chốt phiên và khóa phiên chưa được triển khai; bảng sẽ chỉ hiển thị dữ liệu thực sau khi backend được kết nối.</div>
  </div>
}
