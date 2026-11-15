import { useEffect, useState } from 'react'
import { getCurrentUser, login } from '../services/authService'
import { tokenStorage } from '../services/tokenStorage'
import type { LoginCredentials, UserProfile } from '../types/auth'
export function useAuth() {
  const [token, setToken] = useState(tokenStorage.get)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileError, setProfileError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const expired = () => { setToken(null); setProfile(null); setProfileError(null) }
    window.addEventListener('auth:expired', expired)
    return () => window.removeEventListener('auth:expired', expired)
  }, [])
  useEffect(() => {
    if (!token) return
    let cancelled = false
    getCurrentUser().then(user => { if (!cancelled) { setProfile(user); setProfileError(null) } }).catch(error => { if (!cancelled) setProfileError(error) })
    return () => { cancelled = true }
  }, [token, attempt])
  const handleLogin = async (values: LoginCredentials) => {
    const { accessToken, user } = await login(values)
    tokenStorage.set(accessToken); setProfileError(null); setToken(accessToken); setProfile(user)
  }
  const handleLogout = () => { tokenStorage.clear(); setToken(null); setProfile(null); setProfileError(null) }
  return { token, profile, profileError, retryProfile: () => setAttempt(value => value + 1), handleLogin, handleLogout }
}

