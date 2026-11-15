import type { LedgerEntry, LedgerWrite } from '../types/ledger'
import { decimalPattern, decimalUnits } from '../../../utils/decimal'

// A note-only edit must not rewrite nullable metadata, currency or business dates.
export function ledgerChanges(values: LedgerWrite, entry?: LedgerEntry): LedgerWrite | Partial<LedgerWrite> {
  if (!entry) return values
  const original: Record<string, unknown> = {
    actual_weight_g:entry.actualWeightG,purity_percent:entry.purityPercent,
    business_date: entry.businessDate?.slice(0, 10), occurred_at: entry.occurredAt ? new Date(entry.occurredAt).toISOString() : undefined,
    transaction_type: entry.transactionType, gold_weight_g: entry.goldWeightG,
    labor_amount_due: entry.laborAmountDue, labor_amount_paid: entry.laborAmountPaid, labor_currency: entry.laborCurrency?.trim(),
    description: entry.description, note: entry.note, reference_type: entry.referenceType, reference_id: entry.referenceId,
    entry_type: entry.entry_type, amount: entry.amount, currency: entry.currency, gold_weight_grams: entry.gold_weight_grams,
  }
  const decimalFields = new Set(['gold_weight_g', 'labor_amount_due', 'labor_amount_paid','actual_weight_g','purity_percent'])
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => {
    if (value === undefined) return false
    const before = original[key]
    if (decimalFields.has(key) && decimalPattern.test(String(value)) && decimalPattern.test(String(before))) return decimalUnits(String(value)) !== decimalUnits(String(before))
    return String(value ?? '') !== String(before ?? '')
  })) as Partial<LedgerWrite>
}
