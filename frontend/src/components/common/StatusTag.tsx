import { Tag } from 'antd'
export function StatusTag({ status }: { status: string }) {
  status = status === 'ACTIVE' ? 'Đang hoạt động' : status === 'INACTIVE' ? 'Ngừng hoạt động' : status
  const isDebt = status.includes('nợ')
  const inactive = status.includes('Ngừng') || status.includes('khóa')
  const color = isDebt ? 'red' : inactive ? 'default' : 'green'
  return <Tag color={color}>{status}</Tag>
}
