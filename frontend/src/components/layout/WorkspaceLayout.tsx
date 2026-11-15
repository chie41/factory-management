import { Layout, Drawer, Button, Dropdown, Avatar } from 'antd'
import { useEffect, useState } from 'react'
import { MenuOutlined, LogoutOutlined } from '@ant-design/icons'
import { initials } from '../../utils/format'
import type { ReactNode } from 'react'
import type { PageKey } from '../../app/router/types'
import type { UserProfile } from '../../features/auth/types/auth'
import { Sidebar } from './Sidebar'
import { HeaderBar } from './HeaderBar'

type WorkspaceLayoutProps = {
  page: PageKey
  onPageChange: (page: PageKey) => void
  profile: UserProfile | null
  onLogout: () => void
  children: ReactNode
}

export function WorkspaceLayout({ page, onPageChange, profile, onLogout, children }: WorkspaceLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const resize = () => { if (!media.matches) setMenuOpen(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  const name = profile?.fullName ?? profile?.name ?? profile?.username ?? 'Tài khoản';
  const navigate = (next: PageKey) => { setMenuOpen(false); onPageChange(next); };
  return (
<Layout className="app-shell">
        <div className="desktop-navigation"><Sidebar active={page} onChange={onPageChange} profile={profile} onLogout={onLogout} /></div>
        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} placement="left" width={280} title="Điều hướng" className="navigation-drawer" styles={{ body: { padding: 0 } }}>
          <Sidebar active={page} onChange={navigate} profile={profile} onLogout={onLogout} />
        </Drawer>
        <Layout className="main-shell">
          <div className="workspace-header">
            <div className="compact-navigation"><Button type="text" icon={<MenuOutlined />} aria-label="Mở menu" onClick={() => setMenuOpen(true)} /><span className="brand-mark">QX</span></div>
            <HeaderBar page={page} />
            <div className="compact-account"><Dropdown trigger={['click']} menu={{ items: [{ key: 'name', label: name, disabled: true }, { key: 'logout', label: 'Đăng xuất', icon: <LogoutOutlined /> }], onClick: ({ key }) => { if (key === 'logout') onLogout(); } }}><Button type="text" aria-label="Tài khoản"><Avatar size={28}>{initials(name)}</Avatar></Button></Dropdown></div>
          </div>
          <main className="page-content">
            {children}
          </main>
        </Layout>
      </Layout>
  )
}
