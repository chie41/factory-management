import { useState } from 'react'
import { Checkbox, Input, Space, Typography } from 'antd'
import type { Permission } from './api'
export function PermissionMatrix({
  catalog,
  value,
  onChange,
  disabled = false
}: {
  catalog: Permission[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const moduleNames: Record<string, string> = {
    design_models:'Mẫu mã', components:'Cấu kiện', boms:'BOM trong mẫu mã',
    orders: 'Đơn hàng', delivery:'Giao hàng', cash:'Thu / Chi',
    customer_ledger: 'Sổ giao dịch',
    customers: 'Khách hàng',
    employees: 'Nhân viên',
    users: 'Tài khoản',
    groups: 'Nhóm quyền',
    roles: 'Vai trò'
  }
  const [search, setSearch] = useState('')
  const groups = new Map<string, Permission[]>()
  for (const p of catalog.filter((p) => (p.code + ' ' + p.name).toLowerCase().includes(search.toLowerCase()))) {
    const key = p.code.split('.')[0]
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  const toggle = (ids: string[], checked: boolean) =>
    onChange(checked ? [...new Set([...value, ...ids])] : value.filter((id) => !ids.includes(id)))
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Input.Search
        placeholder="Tìm permission…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
      />
      <Typography.Text>
        Đã chọn {value.length} quyền. Quyền cấp riêng chỉ bổ sung; bỏ chọn không thu hồi quyền kế thừa.
      </Typography.Text>
      {[...groups].map(([module, permissions]) => {
        const ids = permissions.map((p) => p.id),
          count = ids.filter((id) => value.includes(id)).length
        return (
          <div key={module} style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 8 }}>
            <Checkbox
              disabled={disabled}
              checked={count === ids.length}
              indeterminate={count > 0 && count < ids.length}
              onChange={(e) => toggle(ids, e.target.checked)}
            >
              <b>{moduleNames[module] ? `${moduleNames[module]} (${module})` : module}</b>
            </Checkbox>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              {permissions.map((p) => (
                <Checkbox
                  key={p.id}
                  disabled={disabled}
                  checked={value.includes(p.id)}
                  onChange={(e) => toggle([p.id], e.target.checked)}
                >
                  <span title={p.code}>
                    {p.name}
                    <br />
                    <small>{p.code}</small>
                  </span>
                </Checkbox>
              ))}
            </div>
          </div>
        )
      })}
    </Space>
  )
}
