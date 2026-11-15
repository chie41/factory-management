import type { PageKey } from '../../app/router/types'
export function HeaderBar({ page }: { page: PageKey }) {
  const label = page === 'production-batches' ? 'Vận hành / Lô sản xuất' : page === 'design-models' ? 'Danh mục / Mẫu mã' : page === 'components' ? 'Danh mục / Cấu kiện' : page === 'orders' ? 'Vận hành / Đơn hàng' : page === 'deliveries' ? 'Vận hành / Giao hàng' : page === 'cash' ? 'Sổ & quản lý / Thu / Chi' : page === 'accounts' ? 'Hệ thống / Quản lý tài khoản' : page === 'employees' ? 'Danh bạ / Nhân viên' : page === 'customers' ? 'Danh bạ / Khách hàng' : 'Sổ & quản lý / Sổ giao dịch khách hàng'
  return (
    <header className="topbar">
      <span>{label}</span>
    </header>
  )
}


