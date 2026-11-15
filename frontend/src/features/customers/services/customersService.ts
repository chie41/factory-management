import { apiClient } from '../../../services/apiClient'
import { documentedContract } from '../../../services/apiContract'
import type { ListQuery, ListResponse } from '../../../types/pagination'
import type { Customer, CustomerInput } from '../types/customer'

export async function fetchCustomers(params: ListQuery = { page: 1, page_size: 20 }) {
  const response = (await apiClient.get<ListResponse<Customer>>('/customers', { params })).data
  return { ...response, data: response.data.map(normalizeCustomer) }
}
export function normalizeCustomer(row: Customer & { customer_code?: string }) {
  return { ...row, customerCode: row.customerCode ?? row.customer_code ?? row.code }
}
export async function fetchCustomer(id: string) {
  return normalizeCustomer((await apiClient.get<{ data: Customer }>(`/customers/${id}`)).data.data)
}
export async function saveCustomer(values: CustomerInput, id?: string, confirmation?: string) {
  const { name, phone, address, note, status } = values
  const rest = { name, phone, address, note }
  const fields = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== null && value !== undefined))
  // Swagger 1.1 has no customer status field; do not send unsupported properties.
  const payload = { ...(documentedContract ? { ...fields } : { ...fields, status }), ...(confirmation ? { duplicate_name_confirmation: confirmation } : {}) }
  return id ? apiClient.patch(`/customers/${id}`, payload) : apiClient.post('/customers', payload)
}
export async function deleteCustomer(id: string) { await apiClient.delete(`/customers/${id}`) }


export async function fetchDuplicateCustomerNames(name: string, excludeId?: string) {
  const response = await apiClient.get<{ data: Customer[] }>('/customers/duplicate-names', { params: { name, exclude_id: excludeId } })
  return response.data.data.map(normalizeCustomer)
}
