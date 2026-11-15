import { apiClient } from '../../services/apiClient'
import type { GoldWorker } from './GoldWorkerCard'
import type { GoldAmountRow, GoldOtherRow, GoldScaleRow } from './GoldDailyTables'
import type { GoldLayoutTemplate } from './goldLayoutTemplate'

export type GoldSessionStatus = 'DRAFT'|'FINALIZED'|'LOCKED'|'REOPENED'
export type GoldManual = { scales:GoldScaleRow[];bags:GoldAmountRow[];labels:GoldAmountRow[];others:GoldOtherRow[] }
export type GoldSessionSource = {
 workers:GoldWorker[]
 customerDebt:string
 capturedAt:string
 businessDate:string
}
export type GoldSessionTotals = {
 worker_gold_g:string;scale_gold_g:string;customer_debt_g:string;bag_gold_g:string;
 label_gold_g:string;other_plus_g:string;other_minus_g:string;
 total_gold_g:string;previous_gold_g:string|null;difference_g:string|null
}
export type GoldSession = {
 id:string
 business_date:string
 status:GoldSessionStatus
 version:number
 source_snapshot:GoldSessionSource
 selected_work_ids:string[]
 manual_entries:GoldManual
 layout_snapshot:GoldLayoutTemplate
 totals_snapshot:GoldSessionTotals|null
 finalized_at:string|null
 locked_at:string|null
 lock_after_hours:number
 created_at:string
 updated_at:string
}
export type GoldSessionListRow = {
 id:string
 session_date:string
 status:GoldSessionStatus
 version:number
 finalized_at:string|null
 operator_name:string|null
 total_gold_g:string|null
 difference_g:string|null
 created_at:string
 updated_at:string
}
export const goldSessionApi = {
 async list(month:string) {
  const r=await apiClient.get<{data:GoldSessionListRow[]}>('/gold-refining/sessions',{params:{month}})
  return r.data.data
 },
 async byDate(date:string) {
  const r=await apiClient.get<{data:GoldSession|null}>('/gold-refining/sessions/by-date/'+date)
  return r.data.data
 },
 async create(date:string) {
  const r=await apiClient.post<{data:GoldSession}>('/gold-refining/sessions',{date})
  return r.data.data
 },
 async save(session:GoldSession,manual:GoldManual,selectedWorkIds:string[],layout:GoldLayoutTemplate) {
  const r=await apiClient.patch<{data:GoldSession}>('/gold-refining/sessions/'+session.id,{
   version:session.version,manual,selectedWorkIds,layout,
  })
  return r.data.data
 },
 async reload(session:GoldSession) {
  const r=await apiClient.post<{data:GoldSession;warnings?:{removedWorkIds:string[]}|null}>('/gold-refining/sessions/'+session.id+'/reload',{version:session.version})
  return r.data
 },
 async finalize(session:GoldSession) {
  const r=await apiClient.post<{data:GoldSession}>('/gold-refining/sessions/'+session.id+'/finalize',{version:session.version})
  return r.data.data
 },
 async reopen(session:GoldSession,reason:string) {
  const r=await apiClient.post<{data:GoldSession}>('/gold-refining/sessions/'+session.id+'/reopen',{version:session.version,reason})
  return r.data.data
 },
 async effectiveTemplate(date:string) {
  const r=await apiClient.get<{data:GoldLayoutTemplate}>('/gold-refining/templates/effective',{params:{date}})
  return r.data.data
 },
 async saveDefaultTemplate(effectiveFrom:string,template:GoldLayoutTemplate) {
  const r=await apiClient.patch<{data:unknown}>('/gold-refining/templates/default',{effectiveFrom,template})
  return r.data.data
 },
}
