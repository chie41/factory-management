// Read-only business-data verification: synthetic fixtures only. Requires backend build.
// Run: node scripts/verify-ledger-print.mjs (from frontend).
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { LedgerPdfService } from '../../backend/dist/customer-ledger/print/ledger-pdf.service.js'

const output = resolve('../tmp/pdfs/ledger-print')
await mkdir(output, { recursive: true })
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { ledgerPrintMarkup } = await vite.ssrLoadModule('/src/features/customer-ledger/components/LedgerPrintReport.tsx')
  const pdf = new LedgerPdfService()
  const totals = {
    active_entries: 3, reversed_entries: 0, gold_debt_balance_g: '12345.6789',
    labor_by_currency: { THB: { due: '999999999.0000', paid: '123456789.0000', outstanding: '876543210.0000' }, VND: { due: '123000.0000', paid: '12000.0000', outstanding: '111000.0000' } },
  }
  const fixture = (count, tall = false) => {
    const entries = Array.from({ length: count }, (_, index) => {
      const type = ['DELIVERY', 'RETURN_GOLD', 'RETURN_GOODS'][index % 3]
      return {
        id: `print-${index}`, businessDate: `2026-09-${String(1 + Math.floor(index / 20)).padStart(2, '0')}`,
        transactionType: type, approvalStatus: index === 1 ? 'PENDING' : 'APPROVED', actor_name: 'Nguyễn Văn Vinh',
        referenceType: 'ORDER_DELIVERY', reference_code: 'SOURCE-MUST-NOT-PRINT',
        gold_debt_change_g: type === 'DELIVERY' ? '1234.5678' : '-12.3400',
        laborAmountDue: '999999999.0000', laborAmountPaid: '12345678.0000', laborCurrency: 'THB',
        products: type === 'RETURN_GOLD' ? [] : Array.from({ length: tall ? 65 : 3 }, (_, i) => ({ name: `Chi tiết ${index}-${i} · Nhẫn vàng đính đá`, quantity: i + 1 })),
        note: `DÒNG-${String(index).padStart(4, '0')} ` + (count > 3 ? 'Ghi chú tiếng Việt có dấu, đối chiếu khách hàng và số liệu. '.repeat(2) : 'Ghi chú tiếng Việt có dấu.'),
      }
    })
    const dates = [...new Set(entries.map(e => e.businessDate))]
    return {
      customer: { id: 'synthetic', name: 'Công ty Phú Vinh — kiểm tra in', customer_code: 'TEST' },
      totals, opening_gold_g: '9876.5432', entries,
      daily_summaries: dates.map(date => ({ date, transaction_count: entries.filter(e => e.businessDate === date).length, received_g: '25.0000', delivered_g: '1234.5000', closing_gold_g: '11123.4500', totals })),
    }
  }
  const boundaryDay = fixture(30)
  boundaryDay.entries.forEach((entry, index) => { entry.businessDate = `2026-09-${String(14 + Math.floor(index / 3)).padStart(2, '0')}` })
  const day24 = fixture(3).entries.map((entry, index) => ({
    ...entry, id: `day24-${index}`, businessDate: '2026-09-24',
    transactionType: index === 0 ? 'DELIVERY' : 'RETURN_GOLD',
    products: index === 0 ? [{ name: 'DAY24-PRODUCT-1 · Dây XO 2B', quantity: 2 }, { name: 'DAY24-PRODUCT-2 · Dây XO 1B', quantity: 9 }] : [],
    note: `DAY24-ROW-${index} · Đối chiếu ngày 24/09/2026`,
  }))
  boundaryDay.entries.push(...day24)
  const splitDay = fixture(30)
  splitDay.entries.forEach(entry => { entry.businessDate = '2026-09-24' })
  for (const book of [boundaryDay, splitDay]) {
    book.daily_summaries = [...new Set(book.entries.map(entry => entry.businessDate))].map(date => ({
      date, transaction_count: book.entries.filter(entry => entry.businessDate === date).length,
      received_g: '25.0000', delivered_g: '1234.5000', closing_gold_g: '11123.4500', totals,
    }))
  }
  const manifest = []
  for (const [name, book] of [['one-page', fixture(3)], ['many-pages', fixture(30)], ['tall-detail', fixture(3, true)], ['empty', fixture(0)], ['boundary-day24', boundaryDay], ['split-day24', splitDay]]) {
    const before = JSON.stringify(book)
    const markup = ledgerPrintMarkup(book, { from: '2026-09-01', to: '2026-09-30' }, new Date('2026-10-28T03:04:00Z'))
    assert.equal(JSON.stringify(book), before, 'Printing must not mutate ledger data')
    assert.ok(!markup.includes('THAM CHIẾU') && !markup.includes('SOURCE-MUST-NOT-PRINT'))
    assert.ok(!markup.includes('<button') && !markup.includes('<svg'))
    assert.ok(markup.includes('01/09/2026') && markup.includes('30/09/2026') && markup.includes('10:04'))
    for (const entry of book.entries) assert.ok(markup.includes(entry.note), `Missing ${entry.id}`)
    for (const body of markup.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/g)) {
      assert.ok(!/rowspan=/i.test(body[1]), 'PDF data cells must never span pages')
    }
    const rows = [...markup.matchAll(/<tr\b[^>]*data-ledger-date="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)]
    const expectedRows = book.entries.reduce((count, entry) => count + Math.max(entry.products.length, 1), 0)
    assert.equal(rows.length, expectedRows)
    for (const [, date, row] of rows) {
      assert.ok(row.includes('ledger-print-date'))
      assert.ok(row.includes(date.split('-').reverse().join('/')), 'Every PDF data row repeats its date')
    }
    await writeFile(resolve(output, `${name}.html`), markup)
    await writeFile(resolve(output, `${name}.pdf`), await pdf.render(markup))
    manifest.push({ name, rows: book.entries.length, products: book.entries.flatMap(entry => entry.products).length,
      notes: book.entries.map(entry => entry.note.split(' ')[0]),
      dates: book.daily_summaries.map(day => day.date),
      detailIds: book.entries.flatMap(entry => entry.products.map(product => product.name.split(' · ')[0])),
    })
    console.log(`${name}: ${book.entries.length} source rows; unchanged totals; PDF generated`)
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await assert.rejects(pdf.render('<iframe src="file:///secret"></iframe>'), /không được hỗ trợ/)
  console.log('Rejected active/navigable HTML. No database connection or writes.')
} finally { await vite.close() }
