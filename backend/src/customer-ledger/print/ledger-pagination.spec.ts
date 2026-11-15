import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LedgerPdfService } from './ledger-pdf.service.js';

// Opt-in integration suite uses the same installed Chromium as production.
// Run: LEDGER_PDF_TEST=1 npm test -- ledger-pagination.spec.ts
const css = readFileSync(new URL('../../../../frontend/src/features/customer-ledger/styles/ledger-print.css', import.meta.url), 'utf8');
function fixture(days: number, transactions: number, products: number) {
  const head = '<thead><tr>' + Array.from({ length: 10 }, (_, i) => `<th>${i === 0 ? 'NGÀY' : 'Cột ' + i}</th>`).join('') + '</tr></thead>';
  const bodies = Array.from({ length: days }, (_, day) => {
    const date = day ? '24/09/2026' : '04/09/2026';
    const rows = Array.from({ length: transactions }, (_, entry) => Array.from({ length: products || (entry === 0 ? 2 : 1) }, (_, product) =>
      `<tr data-ledger-entry="${day}-${entry}" data-ledger-product="${product}"><td class="ledger-print-date"><b>${date}</b>${!entry && !product ? `<span>${transactions} giao dịch</span><span>${products ? transactions * products : 3} dòng hàng</span>` : ''}</td><td>${!product ? 'Người giao dịch' : ''}</td><td>${!product ? 'Giao hàng' : ''}</td><td>${!product ? '—' : ''}</td><td>${!product ? '1,00 g' : ''}</td><td class="ledger-print-product">Mẫu ${entry}-${product}</td><td class="ledger-print-product">1</td><td>${!product ? '100 THB' : ''}</td><td>${!product ? '50 THB' : ''}</td><td>${!product ? 'Ghi chú' : ''}</td></tr>`).join('')).join('');
    return `<tbody class="ledger-print-day" data-ledger-day="${day}">${rows}<tr class="ledger-day-summary"><td colspan="10">TỔNG KẾT ${date}</td></tr></tbody>`;
  }).join('');
  return `<style>${css}</style><article class="ledger-print-report"><header><h1>SỔ GIAO DỊCH</h1></header><table class="ledger-print-table"><colgroup>${'<col style="width:10%">'.repeat(10)}</colgroup>${head}<tbody><tr><td colspan="10">NỢ ĐẦU KỲ</td></tr></tbody>${bodies}</table></article>`;
}
describe.skipIf(process.env['LEDGER_PDF_TEST'] !== '1')('Chromium ledger pagination', () => {
  it.each([
    ['04/09/2026: two transactions, three product lines', 1, 2, 0],
    ['day near page boundary', 8, 2, 3],
    ['day longer than a page', 1, 60, 3],
    ['transaction longer than a page', 1, 1, 180],
    ['many pages', 30, 3, 3],
  ])('%s', async (_name, days, entries, products) => {
    const pdf = await new LedgerPdfService().render(fixture(Number(days), Number(entries), Number(products)));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  }, 60_000);
});

