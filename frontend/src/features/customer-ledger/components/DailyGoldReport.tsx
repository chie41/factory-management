import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Select, Space, Spin, Empty } from 'antd'
import { LeftOutlined, RightOutlined, PrinterOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { workflowGet } from '../services/workflowService'
import { applicationDate } from '../utils/applicationDate'
import { LedgerDateInput } from './LedgerDateInput'
import { fixedDecimalText } from '../../../utils/decimal'
import { RequestError } from '../../../components/common/RequestError'
import '../styles/daily-gold-report.css'

type Amounts = { opening_gold_g: string; delivered_g: string | null; received_g: string | null; adjustment_g: string; closing_gold_g: string }
type Movement = { transaction_id: string; transaction_datetime: string; gold_amount: string }
type Row = Amounts & { customer_id: string; customer_code: string; customer_name: string; deliveries: Movement[]; receipts: Movement[] }
type Report = {
  date: string; scope: 'all' | 'debt'; rows: Row[];
  column_counts: { deliveries: number; receipts: number };
  totals: Amounts & { delivery_columns_g: string[]; receipt_columns_g: string[]; delivery_count: number; receipt_count: number }
}
const show = (value: string | null) => value === null ? '' : fixedDecimalText(value, 2)
export function DailyGoldReport({ active }: { active: boolean }) {
  const reportElement = useRef<HTMLElement>(null)
  const [date, setDate] = useState(applicationDate)
  const [scope, setScope] = useState<'all' | 'debt'>('all')
  const report = useQuery({
    queryKey: ['customer-ledger', 'daily-gold', 'movements', date, scope],
    queryFn: () => workflowGet<Report>('/customer-ledger/daily-gold', { date, scope }),
    enabled: active,
  })
  useEffect(() => {
    if (!active) return
    document.body.classList.add('printing-daily-gold')
    return () => document.body.classList.remove('printing-daily-gold')
  }, [active])
  const data = report.data
  const ready = active && !!data && data.date === date && data.scope === scope && !report.isFetching && !report.isError
  const printReport = () => {
    if (!ready || !reportElement.current?.isConnected) return
    // The same committed report is already mounted. Apply print scope synchronously
    // before the browser switches media; no timeout or second render is needed.
    document.body.classList.add('printing-daily-gold')
    window.print()
  }
  const hasAdjustment = data?.rows.some(row => !/^-?0+(?:\.0+)?$/.test(row.adjustment_g))
  // An empty group keeps one blank visual slot so its header remains visible.
  const deliverySlots = Array.from({ length: Math.max(1, data?.column_counts.deliveries ?? 0) }, (_, i) => i)
  const receiptSlots = Array.from({ length: Math.max(1, data?.column_counts.receipts ?? 0) }, (_, i) => i)
  // Print-only column bands keep each movement readable on portrait paper.
  // A missing group uses a blank slot; no transaction is combined or omitted.
  const longestMovement = data ? data.rows.reduce((length, row) =>
    [...row.deliveries, ...row.receipts].reduce((max, item) => Math.max(max, show(item.gold_amount).length), length),
    [...data.totals.delivery_columns_g, ...data.totals.receipt_columns_g].reduce((max, value) => Math.max(max, show(value).length), 0)) : 0
  const printColumnBudget = longestMovement > 12 ? 2 : 4
  const printPartCount = Math.max(
    Math.ceil((deliverySlots.length + receiptSlots.length) / printColumnBudget),
    Math.ceil(deliverySlots.length / (printColumnBudget - 1)),
    Math.ceil(receiptSlots.length / (printColumnBudget - 1)),
  )
  let deliveryOffset = 0, receiptOffset = 0
  const printParts = Array.from({ length: printPartCount }, (_, index) => {
    const remainingParts = printPartCount - index
    const deliveryCount = Math.min(printColumnBudget - 1, Math.ceil((deliverySlots.length - deliveryOffset) / remainingParts))
    const receiptCount = Math.min(printColumnBudget - Math.max(1, deliveryCount), Math.ceil((receiptSlots.length - receiptOffset) / remainingParts))
    const deliveries = deliverySlots.slice(deliveryOffset, deliveryOffset + deliveryCount)
    const receipts = receiptSlots.slice(receiptOffset, receiptOffset + receiptCount)
    deliveryOffset += deliveryCount
    receiptOffset += receiptCount
    return { deliveries: deliveries.length ? deliveries : [-1], receipts: receipts.length ? receipts : [-1] }
  })
  const renderHeading = () => data && (<header><h2>SỔ NỢ VÀNG</h2><p className="daily-gold-report-date">{dayjs(data.date).format('DD/MM/YYYY')}</p><small>{data.scope === 'debt' ? 'Chỉ khách đang nợ vàng' : 'Tất cả khách hàng'} · Đơn vị: g</small></header>)
  const renderTable = (deliveryColumns: number[], receiptColumns: number[]) => {
    if (!data) return null
    const columns = 2 + deliveryColumns.length + receiptColumns.length + (hasAdjustment ? 1 : 0)
    return (<div className="daily-gold-scroll"><table style={{ "--gold-report-columns": columns } as CSSProperties}>
          <colgroup>
            <col className="gold-print-index-col" style={{ width: '4%' }} /><col className="gold-print-customer-col" style={{ width: '24%' }} />
            <col className="gold-print-balance-col" style={{ width: `${72 / columns}%` }} />
            {deliveryColumns.map(i => <col key={`delivery-${i}`} className="gold-print-movement-col" style={{ width: `${72 / columns}%` }} />)}
            {receiptColumns.map(i => <col key={`receipt-${i}`} className="gold-print-movement-col" style={{ width: `${72 / columns}%` }} />)}
            {hasAdjustment && <col className="gold-print-adjustment-col" style={{ width: `${72 / columns}%` }} />}
            <col className="gold-print-balance-col" style={{ width: `${72 / columns}%` }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="gold-report-index">STT</th>
              <th scope="col" className="gold-report-customer">KHÁCH</th>
              <th scope="col">NỢ</th>
              <th colSpan={deliveryColumns.length} scope="colgroup" className="gold-report-delivered gold-report-group">GIAO (+)</th>
              <th colSpan={receiptColumns.length} scope="colgroup" className="gold-report-received gold-report-group">NHẬN (-)</th>
              {hasAdjustment && <th scope="col">ĐIỀU CHỈNH</th>}
              <th scope="col">NỢ MỚI</th>
            </tr>
          </thead>
          <tbody>{data.rows.map((row, index) => <tr key={row.customer_id}>
            <td className="gold-report-index">{index + 1}</td><td className="gold-report-customer">{row.customer_name}</td>
            <td><strong>{show(row.opening_gold_g)}</strong></td>
            {deliveryColumns.map(i => <td key={`delivery-${i}`} title={row.deliveries[i] ? `Giao lần ${i + 1} · ${row.deliveries[i].transaction_datetime}` : undefined}>{show(row.deliveries[i]?.gold_amount ?? null)}</td>)}
            {receiptColumns.map(i => <td key={`receipt-${i}`} title={row.receipts[i] ? `Nhận lần ${i + 1} · ${row.receipts[i].transaction_datetime}` : undefined}>{show(row.receipts[i]?.gold_amount ?? null)}</td>)}
            {hasAdjustment && <td>{show(row.adjustment_g)}</td>}
            <td><strong>{show(row.closing_gold_g)}</strong></td>
          </tr>)}</tbody>
          <tfoot><tr>
            <th colSpan={2} scope="row" className="gold-report-total-label">TỔNG</th><td>{show(data.totals.opening_gold_g)}</td>
            {deliveryColumns.map(i => <td key={`delivery-${i}`}>{show(data.totals.delivery_columns_g[i] ?? null)}</td>)}
            {receiptColumns.map(i => <td key={`receipt-${i}`}>{show(data.totals.receipt_columns_g[i] ?? null)}</td>)}
            {hasAdjustment && <td>{show(data.totals.adjustment_g)}</td>}<td>{show(data.totals.closing_gold_g)}</td>
          </tr></tfoot>
        </table></div>)
  }
  return <section className="daily-gold-view">
    <div className="daily-gold-toolbar">
      <Space>
        <Button aria-label="Ngày trước" icon={<LeftOutlined />} onClick={() => setDate(dayjs(date).subtract(1,'day').format('YYYY-MM-DD'))} />
        <div style={{ width: 150 }}><LedgerDateInput value={date} onChange={value => { if (value) setDate(value) }} /></div>
        <Button aria-label="Ngày sau" icon={<RightOutlined />} onClick={() => setDate(dayjs(date).add(1,'day').format('YYYY-MM-DD'))} />
      </Space>
      <Select aria-label="Lọc khách hàng báo cáo" value={scope} style={{ minWidth: 220 }} onChange={setScope} options={[{ value: 'all', label: 'Tất cả khách hàng' }, { value: 'debt', label: 'Chỉ khách đang nợ vàng' }]} />
      <Button icon={<PrinterOutlined />} disabled={!ready} onClick={printReport}>In sổ</Button>
    </div>
    <p className="daily-gold-print-help">
      Nếu bản xem trước vẫn hiện ngày giờ in, tên trang hoặc URL, mở “Cài đặt khác” (More settings) và bỏ chọn “Đầu trang và chân trang” (Headers and footers). Ứng dụng không thể tự thay đổi tùy chọn này của trình duyệt.
      {' '}Số trang dạng trang/tổng số trang ở góc dưới bên phải cần trình duyệt hỗ trợ CSS paged media, như Chrome 131 trở lên; trình duyệt không hỗ trợ sẽ không hiển thị số trang này.
    </p>
    <RequestError error={report.error} retry={() => void report.refetch()} />
    {report.isFetching && <div className="daily-gold-loading" role="status" aria-label="Đang tải sổ vàng"><Spin /></div>}
    {data && !report.isError && <article ref={reportElement} className="daily-gold-report" aria-busy={report.isFetching}>
        <div className="daily-gold-screen">{renderHeading()}{renderTable(deliverySlots, receiptSlots)}</div>
        <div className="daily-gold-print" style={{ '--gold-print-font': longestMovement > 20 ? '7.5pt' : '8.5pt' } as CSSProperties}>
          {printParts.map((part, index) => <section key={index} className="daily-gold-print-page">
            {renderHeading()}
            {printParts.length > 1 && <p className="daily-gold-print-note">Phần {index + 1}/{printParts.length} · Phát sinh theo từng phần; NỢ và NỢ MỚI là số dư cả ngày, lặp lại để đối chiếu.</p>}
            {renderTable(part.deliveries, part.receipts)}
          </section>)}
        </div>
        {!data.rows.length && <div className="daily-gold-empty"><Empty description="Không có khách hàng phù hợp" /></div>}
    </article>}
  </section>
}
