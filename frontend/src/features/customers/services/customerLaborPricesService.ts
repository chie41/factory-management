import { apiClient } from '../../../services/apiClient'
export type ModelLaborPrice = {
  image_url?: string | null;
  id: string; design_model_id: string; name: string; code: string; model_status: string;
  labor_price_per_15g: string; default_labor_price_per_15g: string | null; default_labor_currency: string | null
}
export type LaborPriceModel = { image_url?: string | null; id: string; name: string; code: string; default_labor_price_per_15g: string | null; default_labor_currency: string | null }
export async function customerLaborPrices(id: string) {
  return (await apiClient.get<{data:ModelLaborPrice[]}>(`/customers/${id}/labor-prices`)).data.data
}
export async function laborPriceModels(id: string, q: string, page: number) {
  return (await apiClient.get<{data:LaborPriceModel[];meta:{total:number}}>(`/customers/${id}/labor-prices/models`,{params:{q,page,page_size:30}})).data
}
export async function saveCustomerLaborPrice(id: string, modelId: string, price: string, editing: boolean) {
  return apiClient.request({url:`/customers/${id}/labor-prices/${modelId}`,method:editing?'patch':'post',data:{labor_price_per_15g:price}})
}
export async function deleteCustomerLaborPrice(id: string, modelId: string) {
  await apiClient.delete(`/customers/${id}/labor-prices/${modelId}`)
}

export type LaborPriceGroup = { id: string; name: string; model_count: number }
export type GroupLaborPrice = { id: string; design_model_group_id: string; name: string; model_count: number; labor_price_per_15g: string }
export async function customerGroupLaborPrices(id: string) {
  return (await apiClient.get<{data:GroupLaborPrice[]}>(`/customers/${id}/group-labor-prices`)).data.data
}
export async function laborPriceGroups(id: string, q: string, page: number) {
  return (await apiClient.get<{data:LaborPriceGroup[];meta:{total:number}}>(`/customers/${id}/group-labor-prices/groups`,{params:{q,page,page_size:30}})).data
}
export async function saveCustomerGroupLaborPrice(id: string, groupId: string, price: string, editing: boolean) {
  return apiClient.request({url:`/customers/${id}/group-labor-prices/${groupId}`,method:editing?'patch':'post',data:{labor_price_per_15g:price}})
}
export async function deleteCustomerGroupLaborPrice(id: string, groupId: string) {
  await apiClient.delete(`/customers/${id}/group-labor-prices/${groupId}`)
}
