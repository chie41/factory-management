import { apiClient } from '../../../services/apiClient'
import { documentedContract } from '../../../services/apiContract'
import type { ListResponse, PaginationMeta } from '../../../types/pagination'
import type { LedgerSummary, LedgerEntry, LedgerBook, LedgerWrite, LedgerQuery, LedgerStatistics } from '../types/ledger'

const entryPath = (id: string) => documentedContract ? `/customer-ledger-entries/${id}` : `/customer-ledger/entries/${id}`
export async function fetchLedgerSummary(params: LedgerQuery = { page: 1, page_size: 20 }) {
  return (await apiClient.get<ListResponse<LedgerSummary> & { statistics?: LedgerStatistics }>(documentedContract ? '/customer-ledgers/summary' : '/customer-ledger/summary', { params })).data
}
export async function fetchLedgerEntries(customerId: string, params: LedgerQuery = { page: 1, page_size: 20 }) {
  const path = documentedContract ? `/customers/${customerId}/ledger` : `/customer-ledger/customers/${customerId}`
  return (await apiClient.get<{ data: LedgerBook; meta: PaginationMeta }>(path, { params })).data
}
export async function fetchLedgerEntry(id: string) {
  return (await apiClient.get<{ data: LedgerEntry }>(entryPath(id))).data.data
}
export async function saveLedgerEntry(customerId: string, values: LedgerWrite | Partial<LedgerWrite>, id?: string) {
  if (id) return apiClient.patch(entryPath(id), values)
  return apiClient.post(documentedContract ? `/customers/${customerId}/ledger-entries` : `/customer-ledger/customers/${customerId}/entries`, values)
}
export async function deleteLedgerEntry(id: string, reason: string) {
  return apiClient.delete(entryPath(id), { data: { reason } })
}
export async function allLedgerEntries(customerId: string, filters: Partial<LedgerQuery> = {}) {
  const first = await fetchLedgerEntries(customerId, { ...filters, group_by_day: 'false', page: 1, page_size: 100 })
  const rows = [...first.data.entries]
  for (let page = 2; page <= first.meta.total_pages; page++) {
    const next = await fetchLedgerEntries(customerId, { ...filters, group_by_day: 'false', page, page_size: 100 })
    rows.push(...next.data.entries)
  }
  return rows
}

export async function fetchLedgerPrintBook(customerId: string, filters: Partial<LedgerQuery> = {}) {
  return (await apiClient.get<{ data: LedgerBook }>(`/customer-ledger/customers/${customerId}/print-data`, { params: filters })).data.data
}

export async function createLedgerPdf(markup: string) {
  try {
    return (await apiClient.post<Blob>('/customer-ledger/print/pdf', { markup }, { responseType: 'blob', timeout: 90000 })).data
  } catch (error) {
    // Axios receives error JSON as a Blob too; preserve the server's useful message.
    const response = (error as { response?: { data?: unknown } }).response
    if (response?.data instanceof Blob) {
      try {
        const body = JSON.parse(await response.data.text()) as { message?: string | string[] }
        if (body.message) throw new Error(Array.isArray(body.message) ? body.message.join('; ') : body.message)
      } catch (decoded) {
        if (decoded instanceof Error && !(decoded instanceof SyntaxError)) throw decoded
      }
    }
    throw error
  }
}

