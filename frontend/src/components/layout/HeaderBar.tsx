import type { PageKey } from '../../app/router/types'
import { useLocation } from 'react-router-dom'
export function HeaderBar({ page }: { page: PageKey }) {
  const location = useLocation()
  const label = page === 'gold' ? location.pathname.startsWith('/gold/daily/') ? 'Sổ & quản lý / Vàng / Chi tiết phiên tịnh vàng' : 'Sổ & quản lý / Vàng / Danh sách phiên tịnh vàng' : page === 'production-batches' ? 'Vận hành / Lô sản xuất' : page === 'design-models' ? 'Danh mục / Mẫu mã' : page === 'components' ? 'Danh mục / Cấu kiện' : page === 'orders' ? 'Vận hành / Đơn hàng' : page === 'deliveries' ? 'Vận hành / Giao hàng' : page === 'cash' ? 'Sổ & quản lý / Thu / Chi' : page === 'accounts' ? 'Hệ thống / Quản lý tài khoản' : page === 'employees' ? 'Danh bạ / Nhân viên' : page === 'customers' ? 'Danh bạ / Khách hàng' : 'Sổ & quản lý / Sổ giao dịch khách hàng'
  return (
    <header className="topbar">
      <span>{label}</span>
    </header>
  )
}


