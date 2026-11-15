import { apiClient } from '../../../services/apiClient'
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
