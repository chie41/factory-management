import { apiClient } from '../../../services/apiClient'
import type { ListQuery, ListResponse } from '../../../types/pagination'
import type { Employee, EmployeeInput, EmployeeTab } from '../types/employee'
import type { EmployeeReadModels } from '../types/readModels'
export async function fetchEmployees(params: ListQuery & { status?: string } = { page: 1, page_size: 20 }) {
  return (await apiClient.get<ListResponse<Employee>>('/employees', { params })).data
}
export async function fetchEmployee(id: string) {
  return (await apiClient.get<{ data: Employee }>(`/employees/${id}`)).data.data
}
export async function saveEmployee(values: EmployeeInput, id?: string) {
  const { name, phone, role, status, start_date, note } = values
  const payload = { name, phone, role, status, start_date, note }
  return id ? apiClient.patch<{ data: Employee }>(`/employees/${id}`, payload) : apiClient.post<{ data: Employee }>('/employees', payload)
}
export async function fetchEmployeeTab<T extends EmployeeTab>(id: string, tab: T, params: ListQuery) {
  return (await apiClient.get<{ data: EmployeeReadModels[T]; meta?: ListResponse<unknown>['meta'] }>(`/employees/${id}/${tab}`, { params: tab === 'activity' ? params : undefined })).data
}

