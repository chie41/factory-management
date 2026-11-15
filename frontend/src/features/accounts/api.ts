import { apiClient } from '../../services/apiClient'
import type { EffectivePermission } from '../auth/components/Permissions'
export type Permission = { id: string; code: string; name: string }
export type Named = { id: string; code: string; name: string }
export type Access = Named & {
  system: boolean
  version: string
  permissions: Permission[]
  members: { id: string; username: string; status: string; deleted_at: string | null }[]
  member_count: number
}
export type Account = {
  can_join_group: boolean
  id: string
  username: string
  employee_id: string | null
  full_name: string | null
  employee_code: string | null
  status: string
  version: string
  roles: Named[]
  group: Named | null
  direct_permission_ids: string[]
  effective_permissions: EffectivePermission[]
}
export type Employee = { id: string; employee_code: string; full_name: string }
export async function getData<T>(url: string, params?: object) {
  return (await apiClient.get<{ data: T }>(url, { params })).data.data
}
export async function write<T>(method: 'post' | 'patch' | 'put' | 'delete', url: string, data: object) {
  return (await apiClient.request<{ data: T }>({ method, url, data })).data.data
}
