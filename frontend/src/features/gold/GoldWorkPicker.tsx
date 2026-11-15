import { useEffect, useMemo, useState } from 'react'
import { Checkbox, Empty, Input, Modal, Typography } from 'antd'
import { formatGold, numberOrNull } from './GoldDailyTables'
import type { GoldWork, GoldWorker } from './GoldWorkerCard'

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-')
  return day && month && year ? day + '/' + month + '/' + year : '—'
}
function haoHeo(job: GoldWork): number | null {
  const returned = numberOrNull(job.returned)
  const issued = numberOrNull(job.issued)
  return returned === null || issued === null ? null : returned - issued
}
export function GoldWorkPicker({ worker, available, open, onCancel, onApply }: {
  worker: GoldWorker | null
  available: GoldWork[]
  open: boolean
  onCancel: () => void
  onApply: (workerId: string, selectedIds: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelected(worker?.jobs.map(job => job.id) ?? [])
  }, [open, worker?.id])
  const visible = useMemo(() => available.filter(job =>
    (job.title+' '+job.workDate+' '+dateLabel(job.workDate)).toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))
  ), [available, search])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  return <Modal
    open={open && !!worker}
    title={'Chọn công việc · '+(worker?.name ?? '')}
    onCancel={onCancel}
    okText={'Áp dụng ('+selected.length+')'}
    onOk={() => { if (worker) onApply(worker.id, selected) }}
    width={830}
    destroyOnHidden
  >
    <Typography.Paragraph type="secondary">
      Chọn công việc từ dữ liệu Sản xuất đã lấy cho phiên này. Bỏ chọn chỉ loại khỏi bảng Tịnh vàng,
      không thay đổi phân công ở Sản xuất.
    </Typography.Paragraph>
    <Input.Search allowClear placeholder="Tìm mã lô, công đoạn hoặc ngày công việc" value={search} onChange={e=>setSearch(e.target.value)} />
    <div className="gold-work-picker-meta">{selected.length} công việc được chọn · {available.length} công việc trong snapshot</div>
    <div className="gold-work-picker-list">
      <div className="gold-work-picker-columns">
        <span aria-hidden="true" />
        <span>NGÀY CÔNG VIỆC</span>
        <span>CÔNG VIỆC</span>
        <span>GIAO (g)</span>
        <span>NHẬN (g)</span>
        <span>HAO/HEO (g)</span>
      </div>
      {visible.length === 0 ? <Empty description="Không có công việc phù hợp trong dữ liệu đã lấy" /> : visible.map(job=>{
        const checked = selectedSet.has(job.id)
        const difference = haoHeo(job)
        const change = (next: boolean) => setSelected(prev => next ? [...new Set([...prev,job.id])] : prev.filter(id=>id!==job.id))
        return <div key={job.id} role="button" tabIndex={0} aria-pressed={checked}
          className={'gold-work-picker-row'+(checked?' is-selected':'')}
          onClick={()=>change(!checked)}
          onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();change(!checked)}}}
        >
          <Checkbox checked={checked} onClick={e=>e.stopPropagation()} onChange={e=>change(e.target.checked)} aria-label={'Chọn '+job.title} />
          <span className="gold-work-picker-date">{dateLabel(job.workDate)}</span>
          <span className="gold-work-picker-title" title={job.title}>{job.title}</span>
          <span className="gold-work-picker-weight">{formatGold(numberOrNull(job.issued))}</span>
          <span className="gold-work-picker-weight">{formatGold(numberOrNull(job.returned))}</span>
          <span className={'gold-work-picker-weight'+(difference !== null && difference < 0 ? ' gold-diff-negative' : '')}>{formatGold(difference)}</span>
        </div>
      })}
    </div>
    <Typography.Text type="secondary" className="gold-work-picker-hint">
      Công việc phát sinh sau lần lấy dữ liệu gần nhất chỉ xuất hiện khi bạn bấm Reload dữ liệu (sau khi kết nối API).
    </Typography.Text>
  </Modal>
}
