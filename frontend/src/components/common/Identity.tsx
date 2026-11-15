import { Avatar, Space } from 'antd'
import { initials } from '../../utils/format'
export function Identity({ name, code }: { name?: string; code?: string }) {
  return (
    <Space>
      <Avatar size={30}>{initials(name)}</Avatar>
      <div className="identity"><strong>{name ?? '—'}</strong><span>{code ?? ''}</span></div>
    </Space>
  )
}