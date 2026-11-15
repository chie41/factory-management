import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { workflowWrite } from '../services/workflowService'
import { errorText } from '../../../services/apiErrors'
import type { Draft } from '../utils/quickEntryDraft'
export type PriceRequest = { lineId: string; modelId: string; requestId: string }
export type EffectiveLaborPrice = { design_model_id: string; labor_price_per_15g: string | null; currency: string | null; source: 'CUSTOMER' | 'GROUP' | 'MODEL' | 'GROUP_DEFAULT' | 'NONE' | 'DEFAULT' }
export type PriceResolution = { draftId: string; customerId: string; requests: PriceRequest[]; rows?: EffectiveLaborPrice[]; error?: string }
export function QuickLaborPriceResolver({ draft, apply }: { draft: Draft; apply: (value: PriceResolution) => void }) {
  const customerId = draft.customer?.id
  const requests: PriceRequest[] = !draft.order && draft.type === 'DELIVERY' ? draft.lines.flatMap(l => l.model && l.pricingRequestId ? [{lineId:l.id,modelId:l.model.id,requestId:l.pricingRequestId}] : []) : []
  const signature = JSON.stringify(requests)
  const modelIds = [...new Set(requests.map(r=>r.modelId))]
  const query = useQuery({
    queryKey: ['quick-effective-prices',draft.id,customerId,signature],
    queryFn: () => workflowWrite<EffectiveLaborPrice[]>('/customer-ledger/quick-entries/labor-prices',{customer_id:customerId,model_ids:modelIds}),
    enabled: !!customerId && requests.length>0,
  })
  useEffect(() => {
    const pending = JSON.parse(signature) as PriceRequest[]
    if (!customerId || !pending.length || query.isFetching || (!query.data && !query.error)) return
    apply({draftId:draft.id,customerId,requests:pending,rows:query.data,error:query.error?errorText(query.error):undefined})
  }, [apply,customerId,draft.id,signature,query.data,query.error,query.isFetching])
  return null
}
