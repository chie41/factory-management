import axios from 'axios'
import { tokenStorage } from '../features/auth/services/tokenStorage'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export const apiClient = axios.create({ baseURL: API_BASE, timeout: 20000 })

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !error.config?.url?.endsWith('/auth/login')) {
    tokenStorage.clear()
    window.dispatchEvent(new Event('auth:expired'))
  }
  if (error.response?.status === 403) window.dispatchEvent(new Event('auth:permissions-stale'))
  return Promise.reject(error)
})

