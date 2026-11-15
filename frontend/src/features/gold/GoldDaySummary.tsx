import { Button } from 'antd'
import { formatGold } from './GoldDailyTables'
type Props = {
  workerBalance: number
  scale: number
  debt: number
  bags: number
  labels: number
  plus: number
  minus: number
  previous: number | null
  onFinalize?: () => void
  finalizeDisabled?: boolean
  finalizeBusy?: boolean
}
export function GoldDaySummary({ workerBalance, scale, debt, bags, labels, plus, minus, previous, onFinalize, finalizeDisabled = true, finalizeBusy = false }: Props) {
  const total = workerBalance + scale + debt - bags - labels + plus - minus
  const difference = previous == null ? null : total - previous
  const highlight = difference != null && (difference < 0 || difference > 30)
  const lines = [
    ['Tổng giao thợ', workerBalance],
    ['Vàng cân hiện tại', scale],
    ['Khách nợ vàng', debt],
    ['Túi bóng', -bags],
    ['Nhãn đá', -labels],
    ['Yếu tố khác · Cộng', plus],
    ['Yếu tố khác · Trừ', -minus],
  ] as const
  return <aside className="gold-day-summary">
    <h2>TỔNG KẾT NGÀY</h2>
    <div className="gold-summary-items">{lines.map(([label,value],i)=><div className="gold-summary-item" key={label}>
      <span>{label}</span><strong>{i===3||i===4||i===6?'−':i===5?'+':''}{formatGold(Math.abs(value),' g')}</strong>
    </div>)}</div>
    <div className="gold-summary-separator" />
    <h3>TỔNG VÀNG TỊNH ĐƯỢC</h3>
    <div className="gold-summary-main">{formatGold(total,' g')}</div>
    <div className="gold-summary-item gold-last"><span>Lần tịnh trước</span><strong>{formatGold(previous,' g')}</strong></div>
    <h3>CHÊNH LỆCH</h3>
    <div className={'gold-summary-difference'+(highlight?' is-alert':'')}>{difference == null?'—':(difference>0?'+':'')+formatGold(difference,' g')}</div>
    <div className="gold-summary-state">{difference==null?'Chưa có dữ liệu phiên trước':difference<0?'Thiếu':difference>30?'Thừa bất thường':difference>0?'Thừa':'Khớp'}</div>
    <p className="gold-summary-info">{previous == null ? 'Chưa có phiên trước đã chốt' : 'Số dư phiên đã chốt gần nhất trước ngày này'}</p>
    <Button block type="primary" disabled={finalizeDisabled} loading={finalizeBusy} onClick={onFinalize}>Chốt phiên tịnh vàng</Button>
  </aside>
}
