import { ledgerEntryLabor } from '../utils/ledgerLaborText'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { Fragment } from 'react'
import { Button, Dropdown, Empty, Pagination, Spin, Tag, Tooltip } from 'antd'
import type { LedgerBook, LedgerEntry } from '../types/ledger'
import type { PaginationMeta } from '../../../types/pagination'
import { currencyText, weightText, decimalUnits } from '../../../utils/decimal'
import { dateText } from '../../../utils/format'
import { transactionLabels } from '../types/ledger'

export function LedgerDailyTable({ book, loading, meta, page, pageSize, onPage, inspect, edit, reverse }: { book?: LedgerBook; loading: boolean; meta?: PaginationMeta; page: number; pageSize: number; onPage: (page: number, size: number) => void; inspect: (row: LedgerEntry) => void; edit: (row: LedgerEntry) => void; reverse: (row: LedgerEntry) => void }) {
  return <div className="ledger-daily-table"><Spin spinning={loading}><div className="ledger-daily-scroll">
    <LedgerTransactionTable book={book} loading={loading} inspect={inspect} edit={edit} reverse={reverse} />
  </div></Spin><div className="ledger-daily-pagination"><span>{meta?.total ?? 0} ngày có giao dịch · số dư theo toàn bộ lịch sử có hiệu lực</span><Pagination current={page} pageSize={pageSize} total={meta?.total ?? 0} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} onChange={onPage} /></div></div>
}
const noAction = () => {}
// Static PDF rendering must update with this module, outside React's screen refresh boundary.
export function renderLedgerTransactionTable(props: Parameters<typeof LedgerTransactionTable>[0]) {
  return <LedgerTransactionTable {...props} />
}
export function LedgerTransactionTable({ book, loading = false, print = false, inspect = noAction, edit = noAction, reverse = noAction }: {
  book?: LedgerBook; loading?: boolean; print?: boolean;
  inspect?: (row: LedgerEntry) => void; edit?: (row: LedgerEntry) => void; reverse?: (row: LedgerEntry) => void;
}) {
  const days = [...new Set((book?.entries ?? []).map(e => e.businessDate ?? e.occurredAt?.slice(0, 10) ?? ''))]
  const showStatus = (book?.entries ?? []).some(entry => !entry.reversedAt && entry.approvalStatus === 'PENDING')
  const columnCount = (showStatus ? 17 : 16) - (print ? 2 : 0)
  const leadingColumns = (print ? 3 : 4) + (showStatus ? 1 : 0)
  const trailingColumns = columnCount - leadingColumns - 6
  const widths = print
    ? [...(showStatus ? [9] : []), 11, 9, 12, 11, 11, 21, 7, 12, 12, 9, 11, 11, 11, 12]
    : [...(showStatus ? [100] : []), 96, 90, 96, 100, 88, 88, 190, 60, 110, 120, 95, 110, 120, 120, 140, 32]
  const printWidth = widths.reduce<number>((sum, width) => sum + (width ?? 0), 0)
  const renderDay = (date: string) => {
          const entries = book!.entries.filter(e => (e.businessDate ?? e.occurredAt?.slice(0, 10) ?? '') === date)
          const summary = book?.daily_summaries?.find(day => day.date === date)
          const productCount = entries.reduce((sum, entry) => sum + (entry.products?.length ?? 0), 0)
          return <LedgerDayRows key={date} date={date} entries={entries} print={print} showStatus={showStatus} productCount={productCount} inspect={inspect} edit={edit} reverse={reverse} summary={summary} />
  }
  return (
    <table className={print ? "ledger-print-table" : undefined} style={print ? undefined : { width: printWidth, minWidth: printWidth }}><colgroup>{widths.map((width, i) => <col key={i} style={width ? { width: print ? `${width * 100 / printWidth}%` : width } : undefined} />)}</colgroup>
      <thead><tr>{showStatus && <th rowSpan={2}>TRẠNG THÁI</th>}<th rowSpan={2}>NGÀY</th>{!print && <th rowSpan={2}>THAM CHIẾU</th>}<th rowSpan={2}>NGƯỜI GIAO DỊCH</th><th rowSpan={2} className="ledger-group-divider">LOẠI GIAO DỊCH</th><th rowSpan={2}>NHẬN (-)</th><th rowSpan={2}>GIAO (+)</th><th colSpan={4} className="ledger-group-divider">CHI TIẾT HÀNG</th><th colSpan={3}>TÍNH CÔNG</th><th rowSpan={2}>TIỀN CÔNG ĐÃ TRẢ</th><th rowSpan={2}>GHI CHÚ</th>{!print && <th rowSpan={2} aria-label="Thao tác" />}</tr><tr><th>TÊN / MẪU HÀNG</th><th>SỐ LƯỢNG</th><th>TRỌNG LƯỢNG SP</th><th className="ledger-group-divider">TRỌNG LƯỢNG TỔNG</th><th>GIÁ CÔNG</th><th>CÔNG</th><th>TỔNG CÔNG</th></tr></thead>
      <tbody><tr className="ledger-opening"><td colSpan={leadingColumns} className="ledger-group-divider"><b>NỢ ĐẦU KỲ</b></td><td colSpan={6} className="ledger-group-divider" /><td colSpan={trailingColumns} className="ledger-number"><strong>{weightText(book?.opening_gold_g)}</strong></td></tr>
        {!print && days.map(renderDay)}
        {!loading && !days.length && <tr><td colSpan={columnCount}>{print ? "Chưa có giao dịch phù hợp" : <Empty description="Chưa có giao dịch phù hợp" />}</td></tr>}
      </tbody>
      {print && days.map(date => <tbody key={date} className="ledger-print-day" data-ledger-day={date}>{renderDay(date)}</tbody>)}
    </table>
  )
}

function LedgerDayRows({ date, entries, print, showStatus, productCount, summary, inspect, edit, reverse }: { date: string; entries: LedgerEntry[]; print: boolean; showStatus: boolean; productCount: number; summary?: NonNullable<LedgerBook['daily_summaries']>[number]; inspect: (entry: LedgerEntry) => void; edit: (entry: LedgerEntry) => void; reverse: (entry: LedgerEntry) => void }) {
  const { can } = usePermissions()
  const columnCount = (showStatus ? 17 : 16) - (print ? 2 : 0)
  const leadingColumns = (print ? 3 : 4) + (showStatus ? 1 : 0)
  const trailingColumns = columnCount - leadingColumns - 6
  const dayRowCount = entries.reduce((sum, entry) => sum + Math.max(1, entry.products?.length ?? 0), 0)
  return <>{entries.map((entry, index) => {
    let laborClass = '';
    if (!entry.reversedAt && entry.laborAmountDue != null && entry.laborAmountPaid != null) {
      try {
        const due = decimalUnits(entry.laborAmountDue), paid = decimalUnits(entry.laborAmountPaid);
        if (due > 0n && paid < due) laborClass = paid === 0n ? 'labor-unpaid' : 'labor-partial';
      } catch { /* Invalid data retains its original display. */ }
    }
    const delta = entry.gold_debt_change_g
    const type = entry.transactionType ?? entry.entry_type ?? ''
    const labor = ledgerEntryLabor(entry)
    if (print) {
      // Staging rows for Chromium measurement. The PDF renderer partitions pages, then
      // replaces these cells with real page-local date and transaction rowSpans.
      const products = entry.products?.length ? entry.products : [null]
      return <Fragment key={entry.id}>{products.map((product, productIndex) => <tr key={productIndex}
        data-ledger-date={date} data-ledger-entry={entry.id} data-ledger-product={productIndex}
        className={[
          entry.reversedAt ? 'ledger-reversed' : '',
          index === entries.length - 1 && productIndex === products.length - 1 ? 'ledger-before-summary' : '',
        ].filter(Boolean).join(' ')}>
        {showStatus && <td>{productIndex === 0 && !entry.reversedAt && entry.approvalStatus === 'PENDING' ? <Tag color="gold">Chờ duyệt</Tag> : null}</td>}
        <td className="ledger-print-date"><b>{dateText(date)}</b>{index === 0 && productIndex === 0 && <><span>{entries.length} giao dịch</span>{productCount > 0 && <span>{productCount} dòng hàng</span>}</>}</td>
        <td>{productIndex === 0 ? entry.actor_name ?? '—' : null}</td>
        <td className="ledger-group-divider">{productIndex === 0 ? <Tag color={entry.reversedAt ? 'default' : type === 'DELIVERY' ? 'blue' : type === 'RETURN_GOLD' ? 'green' : 'orange'}>{transactionLabels[type] ?? type}</Tag> : null}</td>
        <td className="ledger-receive">{productIndex === 0 ? delta?.startsWith('-') ? <span className="ledger-weight-value">{weightText(delta.slice(1))}</span> : '—' : null}</td>
        <td className="ledger-deliver">{productIndex === 0 ? delta && !delta.startsWith('-') && Number(delta) > 0 ? <span className="ledger-weight-value">{weightText(delta)}</span> : '—' : null}</td>
        <td className="ledger-print-product">{product?.name ?? entry.description ?? '—'}</td><td className="ledger-print-product ledger-number">{product?.quantity ?? '—'}</td><td className="ledger-print-product ledger-number">{weightText(product?.unit_weight_g)}</td><td className="ledger-print-product ledger-number ledger-group-divider">{weightText(product?.total_weight_g)}</td><td className="ledger-print-product ledger-product-price">{currencyText(product?.labor_price_per_15g, 'THB')}</td><td className="ledger-print-product ledger-number">{currencyText(product?.line_labor_amount, 'THB')}</td>
        <td className={`ledger-print-money ${type === 'RETURN_GOLD' ? '' : laborClass}`}>{productIndex === 0 ? labor.due : null}</td>
        <td className="ledger-print-money">{productIndex === 0 ? labor.paid : null}</td>
        <td>{productIndex === 0 ? entry.note || '—' : null}</td>
      </tr>)}</Fragment>
    }
    const products = entry.products?.length ? entry.products : [null]
    return <Fragment key={entry.id}>{products.map((product, productIndex) => <tr key={productIndex} data-ledger-entry={entry.id} data-ledger-product={productIndex} className={[entry.reversedAt ? 'ledger-reversed' : '', index === entries.length - 1 && productIndex === products.length - 1 ? 'ledger-before-summary' : ''].filter(Boolean).join(' ')}>
      {showStatus && productIndex === 0 && <td rowSpan={products.length}>{!entry.reversedAt && entry.approvalStatus === 'PENDING' ? <Tag color="gold">Chờ duyệt</Tag> : null}</td>}
      {index === 0 && productIndex === 0 && <td rowSpan={dayRowCount} className="ledger-merged-date"><b>{dateText(date)}</b><span>{entries.length} giao dịch</span>{productCount > 0 && <span>{productCount} dòng hàng</span>}</td>}
      {productIndex === 0 && <>
        <td rowSpan={products.length}>{entry.referenceType === 'ORDER_DELIVERY' && entry.reference_code ? <Button type="link" onClick={() => inspect(entry)}>{entry.reference_code}</Button> : '—'}</td>
        <td rowSpan={products.length}>{entry.actor_name ?? '—'}</td><td rowSpan={products.length} className="ledger-group-divider"><Tag color={entry.reversedAt ? 'default' : type === 'DELIVERY' ? 'blue' : type === 'RETURN_GOLD' ? 'green' : 'orange'}>{transactionLabels[type] ?? type}</Tag></td>
        <td rowSpan={products.length} className="ledger-receive ledger-number">{delta?.startsWith('-') ? <span className="ledger-weight-value">{weightText(delta.slice(1))}</span> : '—'}</td><td rowSpan={products.length} className="ledger-deliver ledger-number">{delta && !delta.startsWith('-') && Number(delta) > 0 ? <span className="ledger-weight-value">{weightText(delta)}</span> : '—'}</td>
      </>}
      <td>{product?.name ?? entry.description ?? '—'}</td>
      <td className="ledger-number">{product?.quantity ?? '—'}</td>
      <td className="ledger-number">{weightText(product?.unit_weight_g)}</td>
      <td className="ledger-number ledger-group-divider">{weightText(product?.total_weight_g)}</td>
      <td className="ledger-number">{currencyText(product?.labor_price_per_15g, 'THB')}</td>
      <td className="ledger-number">{currencyText(product?.line_labor_amount, 'THB')}</td>
      {productIndex === 0 && <>
      <td rowSpan={products.length} className={`ledger-number ${type === 'RETURN_GOLD' ? '' : laborClass}`}>{labor.due}</td><td rowSpan={products.length} className="ledger-number">{labor.paid}</td><td rowSpan={products.length}>{entry.note || '—'}</td>
      <td rowSpan={products.length}><Dropdown trigger={['click']} menu={{ items: [{ key: 'view', label: 'Xem chi tiết' }, ...(can('customer_ledger.update') ? [{ key: 'edit', label: 'Chỉnh sửa giao dịch', disabled: !!entry.reversedAt||['ORDER_DELIVERY','MANUAL_DELIVERY','GOODS_RETURN'].includes(entry.referenceType??'') }] : []),
        ...(['DELIVERY', 'RETURN_GOODS'].includes(type) ? [{ key: 'order', label: <Tooltip title="Module đơn hàng chưa được triển khai trong repository">Xem đơn hàng liên quan</Tooltip>, disabled: true }] : []),
        ...(type === 'DELIVERY' ? [{ key: 'delivery', label: <Tooltip title="Module giao hàng chưa được triển khai trong repository">Xem giao hàng liên quan</Tooltip>, disabled: true }] : []),
        ...(can('customer_ledger.reverse') ? [{ key: 'reverse', label: 'Xóa giao dịch', danger: true, disabled: (!!entry.referenceId && ['ORDER_DELIVERY','MANUAL_DELIVERY','GOODS_RETURN'].includes(entry.referenceType??'')) }] : [])], onClick: ({ key }) => { if (key === 'view') inspect(entry); else if (key === 'edit') edit(entry); else if (key === 'reverse') reverse(entry) } }}><Button type="text" aria-label={`Thao tác giao dịch ${entry.id.slice(0, 8)}`}>⋯</Button></Dropdown></td>
      </>}
    </tr>)}</Fragment>
  })}<tr className="ledger-day-summary"><td colSpan={leadingColumns} className="ledger-group-divider"><div className="ledger-summary-inline"><span style={{ marginInlineStart: 'auto' }}>NỢ CUỐI NGÀY: <strong>{weightText(summary?.closing_gold_g)}</strong></span></div></td><td colSpan={6} className="ledger-group-divider" /><td colSpan={trailingColumns} /></tr></>}



