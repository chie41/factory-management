import { Button, Tooltip } from 'antd'
import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import { formatGold, numberOrNull, sumGold } from './GoldDailyTables'

/** id must identify one production assignment/transaction line, never just the batch code. */
export type GoldWork = { id: string; title: string; workDate: string; issued: string; returned?: string }
export type GoldWorker = { id: string; name: string; jobs: GoldWork[] }

export function GoldWorkerCard({ worker, onPick, onRemove }: {
  worker: GoldWorker
  onPick: () => void
  onRemove: (workId: string) => void
}) {
  const issued = sumGold(worker.jobs.map(job => numberOrNull(job.issued)))
  const returned = sumGold(worker.jobs.map(job => numberOrNull(job.returned)))
  const allComplete = worker.jobs.every(job => job.returned !== undefined)
  const diff = allComplete ? returned - issued : null
  return <section className="gold-worker">
    <header className="gold-worker-header">
      <strong>{worker.name}</strong>
      <Button className="gold-worker-add" size="small" type="text" icon={<PlusOutlined />} onClick={onPick}>Chọn công việc</Button>
    </header>
    <table className="gold-worker-sheet">
      <colgroup>
        <col style={{width:'43%'}}/><col style={{width:'19%'}}/><col style={{width:'19%'}}/><col style={{width:'19%'}}/>
      </colgroup>
      <thead><tr><th>CÔNG VIỆC</th><th>GIAO</th><th>NHẬN</th><th>HAO/HEO</th></tr></thead>
      <tbody>{Array.from({length:Math.max(2,worker.jobs.length)},(_,i)=>{
        const job = worker.jobs[i]
        const rowDiff = job && numberOrNull(job.returned) != null ? (numberOrNull(job.returned) ?? 0) - (numberOrNull(job.issued) ?? 0) : null
        return <tr key={job?.id ?? 'empty-'+i}>
          <td title={job?.title ?? ''}>
            {job ? <span className="gold-worker-work-name">
              <Tooltip title="Loại khỏi phiên tịnh vàng (không xóa giao việc)">
                <Button type="text" size="small" className="gold-worker-remove" aria-label={'Bỏ công việc '+job.title} icon={<CloseOutlined />} onClick={()=>onRemove(job.id)} />
              </Tooltip>
              <span className="gold-worker-work-text">{job.title}</span>
            </span> : ''}
          </td>
          <td>{job ? formatGold(numberOrNull(job.issued)) : ''}</td>
          <td>{job ? formatGold(numberOrNull(job.returned)) : ''}</td>
          <td className={rowDiff == null ? '' : rowDiff < 0 ? 'gold-diff-negative' : rowDiff > 0 ? 'gold-diff-positive' : ''}>{job ? formatGold(rowDiff) : '—'}</td>
        </tr>
      })}</tbody>
      <tfoot><tr><th>TỔNG</th><td>{formatGold(issued)}</td><td>{allComplete ? formatGold(returned) : '—'}</td>
        <td className={diff != null && diff < 0 ? 'gold-diff-negative' : ''}>{formatGold(diff)}</td></tr></tfoot>
    </table>
  </section>
}
