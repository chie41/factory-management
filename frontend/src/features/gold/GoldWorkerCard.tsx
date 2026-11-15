import { formatGold, numberOrNull, sumGold } from './GoldDailyTables'
export type GoldWork = { title: string; issued: string; returned?: string }
export type GoldWorker = { id: string; name: string; jobs: GoldWork[] }
export function GoldWorkerCard({ worker }: { worker: GoldWorker }) {
  const issued = sumGold(worker.jobs.map(job => numberOrNull(job.issued)))
  const returned = sumGold(worker.jobs.map(job => numberOrNull(job.returned)))
  const allComplete = worker.jobs.every(job => job.returned !== undefined)
  const diff = allComplete ? returned - issued : null
  return <section className="gold-worker">
    <header className="gold-worker-header"><strong>{worker.name}</strong>{worker.jobs.length ? null : <span>Không phát sinh</span>}</header>
    <table className="gold-worker-sheet">
      <colgroup><col style={{width:'43%'}}/><col style={{width:'19%'}}/><col style={{width:'19%'}}/><col style={{width:'19%'}}/></colgroup>
      <thead><tr><th>CÔNG VIỆC</th><th>NHẬN</th><th>TỊNH</th><th>HAO/HEO</th></tr></thead>
      <tbody>{Array.from({length:Math.max(2,worker.jobs.length)},(_,i)=>{
        const job=worker.jobs[i]
        const rowDiff = job && numberOrNull(job.returned) != null ? (numberOrNull(job.returned) ?? 0) - (numberOrNull(job.issued) ?? 0) : null
        return <tr key={i}>
          <td title={job?.title ?? ''}>{job?.title ?? ''}</td><td>{job ? formatGold(numberOrNull(job.issued)) : ''}</td>
          <td>{job ? formatGold(numberOrNull(job.returned)) : ''}</td>
          <td className={rowDiff == null ? '' : rowDiff < 0 ? 'gold-diff-negative' : rowDiff > 0 ? 'gold-diff-positive' : ''}>{job ? formatGold(rowDiff) : '—'}</td>
        </tr>
      })}</tbody>
      <tfoot><tr><th>TỔNG</th><td>{formatGold(issued)}</td><td>{allComplete ? formatGold(returned) : '—'}</td>
        <td className={diff != null && diff < 0 ? 'gold-diff-negative' : ''}>{formatGold(diff)}</td></tr></tfoot>
    </table>
  </section>
}
