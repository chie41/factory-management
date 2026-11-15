import { useState } from 'react'
import { Button } from 'antd'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { LedgerCustomerLayout } from './LedgerCustomerLayout'
import { useLedger } from '../hooks/useLedger'
import type { LedgerSummary } from '../types/ledger'
import { CustomerLedgerFilters } from './CustomerLedgerFilters'
import { CustomerLedgerSummaryTable } from './CustomerLedgerSummaryTable'
import { RequestError } from '../../../components/common/RequestError'

export function CustomerLedgerSummary({ open }: { open: (row: LedgerSummary, entryId?: string) => void }) {
  const [arranging, setArranging] = useState(false)
  const { can } = usePermissions()
  const state = useLedger()
  const { summary } = state
  const stats = summary.data?.statistics
  const cards = [
    ['Khách có giao dịch trong kỳ', stats?.customers_with_transactions, ''],
    ['Khách đang nợ tiền công', stats?.customers_with_labor_debt, 'debt-text'],
    ['Khách đang nợ vàng', stats?.customers_with_gold_debt, 'gold-text'],
    ['Giao dịch hôm nay', stats?.today_transactions, 'ledger-blue'],
  ] as const
  return <div className="ledger-summary">
    <div className="ledger-summary-cards">{cards.map(([label, value, color]) => <div key={label} className="ledger-summary-card"><b className={color}>{summary.isPending ? '…' : value ?? '—'}</b><span>{label}</span></div>)}</div>
    {arranging && <LedgerCustomerLayout close={() => setArranging(false)} />}
    <CustomerLedgerFilters value={state.filters} change={state.setFilters} reset={state.resetFilters} actions={can('customer_ledger.update') && <Button onClick={() => setArranging(true)}>Sắp xếp khách hàng</Button>} />
    <RequestError error={summary.error} retry={() => void summary.refetch()} />
    <CustomerLedgerSummaryTable rows={summary.data?.data ?? []} loading={summary.isFetching} open={open} pagination={{ current: state.page, pageSize: state.pageSize, total: summary.data?.meta.total ?? 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], onChange: state.setPage, showTotal: total => `${total} khách hàng được tìm thấy` }} />
  </div>
}
