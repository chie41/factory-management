import { Card, Typography } from 'antd'
import { LoginForm } from '../features/auth/components/LoginForm'
import type { LoginCredentials } from '../features/auth/types/auth'
export function LoginPage({ onLogin }: { onLogin: (values: LoginCredentials) => Promise<void> }) {
  return <div className="login-screen"><section className="login-panel">
    <div className="brand-row large"><div className="brand-mark">QX</div><div><strong>QUẢN LÝ XƯỞNG</strong><span>Vận hành tinh gọn</span></div></div>
    <Typography.Title level={2}>Đăng nhập</Typography.Title>
    <Typography.Paragraph>Truy cập hệ thống quản lý nhân viên, khách hàng và sổ giao dịch.</Typography.Paragraph>
    <LoginForm onLogin={onLogin} />
  </section><section className="login-visual"><Card><Typography.Title level={3}>Mọi giao dịch, một nơi quản lý</Typography.Title><Typography.Paragraph>Quản lý hồ sơ nhân viên, thông tin khách hàng và theo dõi sổ giao dịch của xưởng.</Typography.Paragraph></Card></section></div>
}

