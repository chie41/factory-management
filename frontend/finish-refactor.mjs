import fs from 'node:fs';
const write=(p,s)=>{fs.mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(p,s)};
write('src/features/auth/services/authService.ts',`import { apiClient } from '../../../services/apiClient'
import type { LoginCredentials, UserProfile } from '../types/auth'

type LoginPayload = {
  access_token?: string
  accessToken?: string
  token?: string
  user?: UserProfile
}
type Envelope<T> = T | { data: T }
const unwrap = <T extends object>(payload: Envelope<T>): T => 'data' in payload ? payload.data : payload

export async function login(credentials: LoginCredentials) {
  const response = await apiClient.post<Envelope<LoginPayload>>('/auth/login', credentials)
  const payload = unwrap(response.data)
  const accessToken = payload.access_token ?? payload.accessToken ?? payload.token
  if (!accessToken) throw new Error('Backend không trả về access token')
  return { accessToken, user: payload.user ?? null }
}

export async function getCurrentUser() {
  const response = await apiClient.get<Envelope<UserProfile>>('/auth/me')
  return unwrap(response.data)
}
`);
write('src/features/auth/hooks/useAuth.ts',`import { useEffect, useState } from 'react'
import { message } from 'antd'
import { getCurrentUser, login } from '../services/authService'
import { tokenStorage } from '../services/tokenStorage'
import type { LoginCredentials, UserProfile } from '../types/auth'

export function useAuth() {
  const [token, setToken] = useState(tokenStorage.get)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  useEffect(() => {
    if (!token) return
    let cancelled = false
    getCurrentUser()
      .then((user) => { if (!cancelled) setProfile(user) })
      .catch(() => { if (!cancelled) setProfile({ fullName: 'Bounmy', username: 'admin' }) })
    return () => { cancelled = true }
  }, [token])

  const handleLogin = async (values: LoginCredentials) => {
    const { accessToken, user } = await login(values)
    tokenStorage.set(accessToken)
    setToken(accessToken)
    setProfile(user)
    message.success('Đăng nhập thành công')
  }
  const handleLogout = () => {
    tokenStorage.clear()
    setToken(null)
    setProfile(null)
  }
  return { token, profile, handleLogin, handleLogout }
}
`);
write('src/features/customer-ledger/hooks/useLedger.ts',`import { useEffect, useState } from 'react'
import type { LedgerSummary, LedgerEntry } from '../types/ledger'
import { sampleLedger, sampleEntries } from '../data/sampleLedger'
import { fetchLedgerSummary, fetchLedgerEntries } from '../services/ledgerService'

export function useLedger() {
  const [summary, setSummary] = useState<LedgerSummary[]>(sampleLedger)
  const [loadedEntries, setLoadedEntries] = useState<{ customerId: string; rows: LedgerEntry[] } | null>(null)
  const [activeCustomer, setActiveCustomer] = useState(sampleLedger[0])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    fetchLedgerSummary()
      .then((next) => {
        if (cancelled) return
        setSummary(next)
        setActiveCustomer(next[0] ?? sampleLedger[0])
      })
      .catch(() => { if (!cancelled) setSummary(sampleLedger) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const customerId = activeCustomer.customerId ?? activeCustomer.id
  useEffect(() => {
    // Keep the existing sample customer behavior until real data replaces the fixtures.
    if (!customerId || customerId === 'c1') return
    let cancelled = false
    fetchLedgerEntries(customerId)
      .then((rows) => { if (!cancelled) setLoadedEntries({ customerId, rows }) })
      .catch(() => { if (!cancelled) setLoadedEntries({ customerId, rows: sampleEntries }) })
    return () => { cancelled = true }
  }, [customerId])
  const entries = customerId && customerId !== 'c1' && loadedEntries?.customerId === customerId
    ? loadedEntries.rows : sampleEntries
  const debtCustomers = summary.filter((row) => Number(row.laborDebtAmount ?? row.laborDebt ?? 0) > 0).length
  const goldDebtCustomers = summary.filter((row) => Number(row.goldDebtGram ?? row.goldDebt ?? 0) > 0).length
  return { summary, entries, activeCustomer, setActiveCustomer, loading, debtCustomers, goldDebtCustomers }
}
`);
for(const p of ['src/hooks/useAuth.ts','src/hooks/useLedger.ts'])fs.unlinkSync(p);
let ledger=fs.readFileSync('src/features/customer-ledger/components/CustomerLedger.tsx','utf8');
ledger=ledger.replace('setActiveCustomer, loading }','setActiveCustomer, loading, debtCustomers, goldDebtCustomers }').replace(/  const debtCustomers =[^\n]+\n  const goldDebtCustomers =[^\n]+\n/,'');
fs.writeFileSync('src/features/customer-ledger/components/CustomerLedger.tsx',ledger);
