import { usePermissions } from '../../features/auth/hooks/usePermissions'
import { BookOutlined, CustomerServiceOutlined, DatabaseOutlined, DollarOutlined, HomeOutlined, LogoutOutlined, MenuFoldOutlined, ProductOutlined, SettingOutlined, ShopOutlined, TeamOutlined, ToolOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button } from 'antd'
import type { PageKey } from '../../app/router/types'
import type { UserProfile } from '../../features/auth/types/auth'
import { initials } from '../../utils/format'
export function Sidebar({ active, onChange, profile, onLogout }: { active: PageKey; onChange: (page: PageKey) => void; profile: UserProfile | null; onLogout: () => void }) {
  const { can } = usePermissions()
  const items = [
    { type: 'label', label: 'KHÔNG GIAN LÀM VIỆC' },
    { label: 'Dashboard', icon: <HomeOutlined /> },
    { key: 'orders' as const, label: 'Đơn hàng', icon: <ShopOutlined /> },
    { key: 'deliveries' as const, label: 'Giao hàng', icon: <CustomerServiceOutlined /> },
    { key:'production-batches' as const, label: 'Lô sản xuất', icon: <ToolOutlined /> },
    { key:'design-models' as const, label: 'Mẫu mã', icon: <ProductOutlined /> },
    { key:'components' as const, label: 'Cấu kiện', icon: <ToolOutlined /> },
    { type: 'label', label: 'SỔ & QUẢN LÝ' },
    { key: 'ledger' as const, label: 'Sổ giao dịch khách hàng', icon: <BookOutlined /> },
    { label: 'Sổ lương thợ', icon: <DollarOutlined /> },
    { label: 'Kho vật dụng', icon: <DatabaseOutlined /> },
    { key: 'gold' as const, label: 'Vàng (UI xem trước)', icon: <DollarOutlined /> },
    { key: 'cash' as const, label: 'Thu / Chi', icon: <DollarOutlined /> },
    { label: 'Báo cáo', icon: <MenuFoldOutlined /> },
    { type: 'label', label: 'DANH BẠ' },
    { key: 'customers' as const, label: 'Khách hàng', icon: <TeamOutlined /> },
    { key: 'employees' as const, label: 'Nhân viên', icon: <UserOutlined /> },
    { type: 'label', label: 'HỆ THỐNG' },
    { label: 'Hệ thống', icon: <SettingOutlined /> },
    { key: 'accounts' as const, label: 'Quản lý tài khoản', icon: <TeamOutlined /> },
  ]
  const displayName = profile?.fullName ?? profile?.name ?? profile?.username ?? 'Tài khoản'
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark">QX</div>
        <div><strong>QUẢN LÝ XƯỞNG</strong><span>Vận hành tinh gọn</span></div>
      </div>
      <nav className="nav-list">
        {items.filter(item => !item.key || can(({employees:'employees.read',customers:'customers.read',ledger:'customer_ledger.read',accounts:'users.read',orders:'orders.read',deliveries:'delivery.manage',cash:'cash.read','design-models':'design_models.read',components:'components.read','production-batches':'production.read',gold:'production.read'})[item.key])).map((item, index) =>
          item.type === 'label' ? (
            <div className="nav-label" key={`${item.label}-${index}`}>{item.label}</div>
          ) : (
            <button key={item.label} className={`nav-item ${item.key === active ? 'active' : ''}`} disabled={!item.key} title={!item.key ? 'Ngoài phạm vi triển khai' : undefined} onClick={() => item.key && onChange(item.key)} type="button">
              {item.icon}<span>{item.label}</span>
            </button>
          ),
        )}
      </nav>
      <div className="account-card">
        <Avatar size={30}>{initials(displayName)}</Avatar>
        <div><strong>{displayName}</strong><span>Quản lý xưởng</span></div>
        <Button type="text" icon={<LogoutOutlined />} onClick={onLogout} />
      </div>
    </aside>
  )
}



