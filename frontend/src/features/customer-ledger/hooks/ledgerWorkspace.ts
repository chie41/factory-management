import type { LedgerFilters, LedgerViewState } from '../types/ledger'
export type CustomerTab = { id: string; name?: string; code?: string }
type Workspace = { tabs: CustomerTab[]; views: Record<string, LedgerViewState> }
const storageKey = 'customer-ledger-workspace-v2'
const listeners = new Set<() => void>()
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const empty: Workspace = { tabs: [], views: {} }
const freshView = (): LedgerViewState => ({ filters: { q: '' }, page: 1, pageSize: 10 })
function restore(): Workspace {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Workspace | null
    if (!saved || !Array.isArray(saved.tabs) || !saved.views) return empty
    const tabs = saved.tabs.filter(t => uuid.test(t.id)).filter((t, i, all) => all.findIndex(other => other.id === t.id) === i)
    const views: Workspace['views'] = {}
    for (const key of ['summary', ...tabs.map(t => t.id)]) {
      const view = saved.views[key]
      if (view && typeof view.filters?.q === 'string' && Number.isInteger(view.page) && view.page > 0 && [10, 20, 50, 100].includes(view.pageSize)) views[key] = view
    }
    return { tabs, views }
  } catch { return empty }
}
let state = restore()
const defaults = new Map<string, LedgerViewState>()
function publish(next: Workspace) {
  state = next
  try { sessionStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* In-memory tabs still work without storage. */ }
  listeners.forEach(listener => listener())
}
export const ledgerWorkspace = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  snapshot: () => state,
  open(tab: CustomerTab) {
    if (!uuid.test(tab.id)) return
    const existing = state.tabs.find(t => t.id === tab.id)
    if (!existing) publish({ ...state, tabs: [tab, ...state.tabs] })
    else if ((tab.name && tab.name !== existing.name) || (tab.code && tab.code !== existing.code)) publish({ ...state, tabs: state.tabs.map(t => t.id === tab.id ? { ...t, ...tab } : t) })
  },
  close(id: string) {
    const views = { ...state.views }; delete views[id]; defaults.delete(id)
    publish({ tabs: state.tabs.filter(t => t.id !== id), views })
  },
  view(key: string) {
    if (!defaults.has(key)) defaults.set(key, freshView())
    return state.views[key] ?? defaults.get(key)!
  },
  filters(key: string, patch: Partial<LedgerFilters>) { publish({ ...state, views: { ...state.views, [key]: { ...this.view(key), page: 1, filters: { ...this.view(key).filters, ...patch } } } }) },
  reset(key: string) { publish({ ...state, views: { ...state.views, [key]: freshView() } }) },
  page(key: string, page: number, pageSize: number) { publish({ ...state, views: { ...state.views, [key]: { ...this.view(key), page, pageSize } } }) },
  clear() {
    defaults.clear()
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i)
        if (key?.startsWith('ledger-draft:')) sessionStorage.removeItem(key)
      }
    } catch { /* Optional persistence. */ }
    publish({ tabs: [], views: {} })
  },
}
