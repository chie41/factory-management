const dirtyForms = new Set<string>()
export function markLedgerDraft(key: string, dirty: boolean) { if (dirty) dirtyForms.add(key); else dirtyForms.delete(key) }
export function confirmLedgerNavigation() { return !dirtyForms.size || window.confirm('Có giao dịch chưa lưu. Chuyển trang?') }

// HashRouter uses the history index to restore a cancelled browser back/forward.
// Internal navigation asks through confirmLedgerNavigation before changing URL.
export function installLedgerHistoryGuard() {
  let currentIndex = Number(window.history.state?.idx ?? 0)
  let restoring = false
  const remember = () => { currentIndex = Number(window.history.state?.idx ?? currentIndex) }
  const guard = (event: PopStateEvent) => {
    if (restoring) { restoring = false; event.stopImmediatePropagation(); return }
    const nextIndex = Number(event.state?.idx ?? currentIndex)
    if (dirtyForms.size && !confirmLedgerNavigation()) {
      const delta = currentIndex - nextIndex
      if (delta) { event.stopImmediatePropagation(); restoring = true; window.history.go(delta) }
    } else currentIndex = nextIndex
  }
  window.addEventListener('popstate', guard, true)
  window.addEventListener('ledger:location', remember)
  return () => { window.removeEventListener('popstate', guard, true); window.removeEventListener('ledger:location', remember) }
}
