import { useSyncExternalStore } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchLedgerEntries, fetchLedgerSummary } from '../services/ledgerService'
import { ledgerWorkspace } from './ledgerWorkspace'
export function useLedger(customerId?: string) {
  useSyncExternalStore(ledgerWorkspace.subscribe, ledgerWorkspace.snapshot)
  const key = customerId ?? 'summary'
  const view = ledgerWorkspace.view(key)
  const params = { ...view.filters, page: view.page, page_size: view.pageSize }
  const summaryParams = { ...params, customer_scope: params.customer_scope ?? 'all' }
  const summary = useQuery({ queryKey: ['ledger', 'summary', summaryParams], queryFn: () => fetchLedgerSummary(summaryParams), enabled: !customerId, placeholderData: keepPreviousData })
  const book = useQuery({ queryKey: ['ledger', 'book', customerId, params], queryFn: () => fetchLedgerEntries(customerId!, { ...params, group_by_day: 'true' }), enabled: !!customerId, placeholderData: keepPreviousData })
  return { summary, book, ...view, setFilters: (patch: Partial<typeof view.filters>) => ledgerWorkspace.filters(key, patch), resetFilters: () => ledgerWorkspace.reset(key), setPage: (page: number, size = view.pageSize) => ledgerWorkspace.page(key, page, size) }
}

