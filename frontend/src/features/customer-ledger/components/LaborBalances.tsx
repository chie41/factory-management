import type { LedgerTotals } from '../types/ledger'
import { currencyText } from '../../../utils/decimal'
export function LaborBalances({ totals }: { totals?: LedgerTotals }) {
  const rows = Object.entries(totals?.labor_by_currency ?? {})
  return rows.length ? <div>{rows.map(([currency, value]) => {
    const raw = value.outstanding;
    const valid = raw != null && /^-?\d+(?:\.\d+)?$/.test(String(raw));
    const zero = valid && /^-?0+(?:\.0+)?$/.test(String(raw));
    return <div key={currency} className={valid && !zero ? 'debt-text' : undefined}>{zero ? '—' : valid ? currencyText(raw, currency) : <span title={`Giá trị công nợ: ${String(raw)}`}>Dữ liệu không hợp lệ</span>}</div>
  })}</div> : <span>—</span>
}
