import type { ReactNode } from 'react'
import { Button, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
export function PageFrame({ title, subtitle, action, children, compact = false, onAction, actionDisabled = false }: { title: string; subtitle: string; action?: string; children: ReactNode; compact?: boolean; onAction?: () => void; actionDisabled?: boolean }) {
  return (
    <section className={`workspace-page ${compact ? 'compact' : ''}`}>
      <div className="page-title-row">
        <div><Typography.Title>{title}</Typography.Title><Typography.Text>{subtitle}</Typography.Text></div>
        {action && <Button type="primary" icon={<PlusOutlined />} onClick={onAction} disabled={actionDisabled}>{action}</Button>}
      </div>
      {children}
    </section>
  )
}
