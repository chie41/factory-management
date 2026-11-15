import { currencyText } from '../../../utils/decimal'
import type { LedgerEntry } from '../types/ledger'

const isZero = (value?: string | number | null) => value != null && /^-?0+(?:\.0+)?$/.test(String(value).trim())
const isPositive = (value?: string | number | null) => value != null && /^\d+(?:\.\d+)?$/.test(String(value).trim()) && /[1-9]/.test(String(value))

// A zero amount is data. Only the paid column has a conditional dash.
export function ledgerLaborText(value?: string | number | null, currency?: string | null): string {
  if (value == null || String(value).trim() === '') return '—'
  return currencyText(value, currency)
}

export function ledgerPaidText(due?: string | number | null, paid?: string | number | null, currency?: string | null): string {
  if (isPositive(due) && isZero(paid)) return '—'
  return ledgerLaborText(paid, currency)
}

export function ledgerEntryLabor(entry: LedgerEntry): { due: string; paid: string } {
  const type = entry.transactionType ?? entry.entry_type
  const goldOnly = ['RETURN_GOLD', 'RETURN_GOODS', 'RETURN_RECOVERED_GOLD', 'GOLD_RETURN_TO_CUSTOMER'].includes(type ?? '')
  // Gold-only rows may carry database defaults of zero without having labor data.
  if (goldOnly && !isPositive(entry.laborAmountDue) && !isPositive(entry.laborAmountPaid)) return { due: '—', paid: '—' }
  const currency = entry.laborCurrency ?? entry.currency
  return {
    due: ledgerLaborText(entry.laborAmountDue, currency),
    paid: ledgerPaidText(entry.laborAmountDue, entry.laborAmountPaid, currency),
  }
}
