import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ledgerWorkspace } from './ledgerWorkspace'
import type { CustomerTab } from './ledgerWorkspace'
import { confirmLedgerNavigation } from './ledgerDraftGuard'

export function useCustomerLedgerTabs() {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const workspace = useSyncExternalStore(ledgerWorkspace.subscribe, ledgerWorkspace.snapshot)
  const activeTabKey = customerId ?? 'summary'
  useEffect(() => { if (customerId) ledgerWorkspace.open({ id: customerId }) }, [customerId])
  const openCustomer = (tab: CustomerTab, entryId?: string) => { if (!confirmLedgerNavigation()) return; ledgerWorkspace.open(tab); navigate(`/ledger/${tab.id}${entryId ? `?entry=${entryId}` : ''}`) }
  const closeCustomer = (id: string) => {
    if (!confirmLedgerNavigation()) return
    const index = workspace.tabs.findIndex(t => t.id === id)
    const remaining = workspace.tabs.filter(t => t.id !== id)
    ledgerWorkspace.close(id)
    if (activeTabKey === id) {
      const adjacent = remaining[Math.min(index, remaining.length - 1)]
      navigate(adjacent ? `/ledger/${adjacent.id}` : '/ledger')
    }
  }
  return { ...workspace, activeTabKey, customerId, openCustomer, closeCustomer, select: (key: string) => { if (confirmLedgerNavigation()) navigate(key === 'summary' ? '/ledger' : `/ledger/${key}`) } }
}
