export type LedgerTotals = {
  active_entries: number
  reversed_entries: number
  gold_debt_pending_g?: string; gold_debt_approved_g?: string; gold_debt_legacy_g?:string; gold_debt_official_g?:string; official_includes_pending?:boolean
  gold_debt_balance_g?: string
  labor_by_currency: Record<string, { due: string; paid: string; outstanding: string }>
}
export type LedgerCustomer = { id: string; customer_code?: string; name: string; phone?: string | null; address?: string | null; status?: string }
export type LedgerSummary = { display_order?: number; customer: LedgerCustomer; totals: LedgerTotals; period_totals?: LedgerTotals; has_gold_debt?: boolean; has_labor_debt?: boolean; latest_transaction_at?: string | null; pending_orders?: number | null; latest_delivery?: { entry_id: string; reference_id?: string | null; reference_code?:string; occurred_at: string } | null }
export type LedgerStatistics = { customers_with_transactions: number; customers_with_labor_debt: number; customers_with_gold_debt: number; today_transactions: number }
export type LedgerFilters = { q: string; from?: string; to?: string; status?: string; debt?: string; customer_scope?: string; transaction_type?: string; reversed?: string; labor_status?: string; currency?: string }
export type LedgerQuery = Partial<LedgerFilters> & { page: number; page_size: number; group_by_day?: string }
export type LedgerViewState = { filters: LedgerFilters; page: number; pageSize: number }
export type TransactionType='DELIVERY'|'RETURN_GOLD'|'RETURN_GOODS'|'RETURN_RECOVERED_GOLD'|'GOLD_RETURN_TO_CUSTOMER'
export type LedgerEntry = {
 approvalStatus?:string; approvedAt?:string|null; approvedBy?:string|null;
 actualWeightG?:string|null; purityPercent?:string|null; recoveredExactGoldG?:string|null; createdBy?:string|null; requestId?:string|null;
  id: string; customerId?: string; businessDate?: string; occurredAt?: string
  transactionType?: string; goldWeightG?: string; laborAmountDue?: string; laborAmountPaid?: string
  laborCurrency?: string | null; laborPaymentStatus?: string; referenceType?: string | null; referenceId?: string | null
  description?: string | null; note?: string | null; reversedAt?: string | null; reversedBy?: string | null
  gold_debt_change_g?: string; gold_debt_running_balance_g?: string
  gold_debt_before_g?: string; updatedAt?: string; createdAt?: string
  created_by_name?: string; transaction_employee_id?:string; actor_name?: string; reference_code?: string; products?: { name: string; quantity: number; labor_price_per_15g?: string | null; line_labor_amount?: string | null; unit_weight_g?: string; total_weight_g?: string }[]
  entry_type?: string; amount?: number; currency?: string; gold_weight_grams?: number | null
}
export type LedgerDay = { date: string; transaction_count: number; received_g: string; delivered_g: string; closing_gold_g: string; totals: LedgerTotals }
export type LedgerBook = { customer: LedgerCustomer; totals: LedgerTotals; entries: LedgerEntry[]; period_totals?: LedgerTotals; opening_gold_g?: string; closing_gold_g?: string; latest_transaction_at?: string | null; pending_orders?: number | null; daily_summaries?: LedgerDay[] }
export type LedgerInput = {
  business_date: string; occurred_at: string; transaction_type: string; gold_weight_g: string
  actual_weight_g?:string; purity_percent?:string; request_id?:string;
  labor_amount_due: string; labor_amount_paid: string; labor_currency?: string
  description?: string; note?: string; reference_type?: string; reference_id?: string
}
export type DocumentedLedgerInput = {
  entry_type: string; amount: number; currency: string; gold_weight_grams?: number
  reference_type?: string; reference_id?: string; note?: string
}
export type LedgerWrite = LedgerInput | DocumentedLedgerInput
export const transactionLabels: Record<string, string> = {
  RETURN_GOLD: 'Khách trả vàng', RETURN_GOODS: 'Trả hàng', RETURN_RECOVERED_GOLD: 'Khách trả vàng hồi',
  DELIVERY: 'Giao hàng', GOLD_RETURN_TO_CUSTOMER: 'Trả vàng cho khách', PAYMENT: 'Thanh toán', ADJUSTMENT: 'Điều chỉnh',
}

