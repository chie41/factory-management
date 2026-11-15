import type { ReactNode } from 'react'
export function FilterRow({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <div className={`filter-row ${compact ? 'compact' : ''}`}>{children}</div>
}