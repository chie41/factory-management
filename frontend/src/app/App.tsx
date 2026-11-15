import { PermissionProvider } from '../features/auth/components/Permissions'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { HashRouter, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button } from 'antd'
import type { PageKey } from './router/types'
import { useAuth } from '../features/auth/hooks/useAuth'
import { WorkspaceProvider } from './providers/ThemeProviders'
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout'
import { LoginPage } from '../pages/LoginPage'
import { PageRouter } from './router/PageRouter'
import { errorText } from '../services/apiErrors'
import '../styles/application.css'
import { ledgerWorkspace } from '../features/customer-ledger/hooks/ledgerWorkspace'
import { confirmLedgerNavigation, installLedgerHistoryGuard } from '../features/customer-ledger/hooks/ledgerDraftGuard'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15000, refetchOnWindowFocus: false }, mutations: { retry: false } } })
export default function App() {
  return <QueryClientProvider client={queryClient}><HashRouter><WorkspaceProvider><Application /></WorkspaceProvider></HashRouter></QueryClientProvider>
}
function Application() {
  const { token, profile, handleLogin, handleLogout, profileError, retryProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const cache = useQueryClient()
  useEffect(installLedgerHistoryGuard, [])
  useEffect(() => { window.dispatchEvent(new Event('ledger:location')) }, [location.key])
  useEffect(() => {
    const expired = () => { cache.clear(); ledgerWorkspace.clear() }
    window.addEventListener('auth:expired', expired)
    return () => window.removeEventListener('auth:expired', expired)
  }, [cache])
  const page: PageKey = location.pathname.startsWith('/gold') ? 'gold' : location.pathname.startsWith('/production-batches') ? 'production-batches' : location.pathname.startsWith('/design-models') ? 'design-models' : location.pathname.startsWith('/components') ? 'components' : location.pathname.startsWith('/orders') ? 'orders' : location.pathname.startsWith('/deliveries') ? 'deliveries' : location.pathname.startsWith('/cash') ? 'cash' : location.pathname.startsWith('/system/accounts') ? 'accounts' : location.pathname.startsWith('/customers') ? 'customers' : location.pathname.startsWith('/ledger') ? 'ledger' : 'employees'
  if (!token) return <LoginPage onLogin={handleLogin} />
  return <PermissionProvider><WorkspaceLayout page={page} onPageChange={next => { if (confirmLedgerNavigation()) navigate(next === 'accounts' ? '/system/accounts' : '/' + next) }} profile={profile} onLogout={() => { if (!confirmLedgerNavigation()) return; cache.clear(); ledgerWorkspace.clear(); handleLogout() }}>
    {!!profileError && <Alert type="error" title={errorText(profileError)} action={<Button onClick={retryProfile}>Thử lại</Button>} />}
    <PageRouter />
  </WorkspaceLayout></PermissionProvider>
}



