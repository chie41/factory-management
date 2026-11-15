import { renderToStaticMarkup } from 'react-dom/server'
import type { LedgerBook, LedgerFilters } from '../types/ledger'
import { currencyText, weightText } from '../../../utils/decimal'
import { dateText } from '../../../utils/format'
import { renderLedgerTransactionTable } from './LedgerDailyTable'
import printCss from '../styles/ledger-print.css?raw'

export function LedgerPrintReport({ book, filters, exportedAt }: {
  book: LedgerBook; filters: Partial<LedgerFilters>; exportedAt: Date
}) {
  // Keep the backend's current cumulative totals and currencies, without summing rows.
  const labor = Object.entries(book.totals.labor_by_currency)
  const exportDate = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(exportedAt)
  const exportClock = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(exportedAt)
  const exportTime = `${exportDate} ${exportClock}`
  return <article className="ledger-print-report">
    <header>
      <h1>SỔ GIAO DỊCH</h1>
      <p><b>Khách hàng:</b> {book.customer.name}</p>
      <div className="report-dates"><span>Từ ngày: {filters.from ? dateText(filters.from) : 'Không giới hạn'} — Đến ngày: {filters.to ? dateText(filters.to) : 'Không giới hạn'}</span><span>Ngày xuất: {exportTime}</span></div>
    </header>
    <section className="report-balances" aria-label="Công nợ lũy kế hiện tại">
      <div><b>TỔNG NỢ VÀNG</b><strong>{weightText(book.totals.gold_debt_balance_g)}</strong></div>
      <div><b>TỔNG TIỀN CÔNG PHẢI TRẢ</b><strong>{labor.length ? labor.map(([currency, value]) => <span key={currency}>{currencyText(value.due, currency)}</span>) : '—'}</strong></div>
      <div><b>TỔNG TIỀN CÔNG ĐÃ TRẢ</b><strong>{labor.length ? labor.map(([currency, value]) => <span key={currency}>{currencyText(value.paid, currency)}</span>) : '—'}</strong></div>
    </section>
    {renderLedgerTransactionTable({ book, print: true })}
  </article>
}

export function ledgerPrintMarkup(book: LedgerBook, filters: Partial<LedgerFilters>, exportedAt = new Date()) {
  return `<style>${printCss}</style>` + renderToStaticMarkup(<LedgerPrintReport book={book} filters={filters} exportedAt={exportedAt} />)
}
