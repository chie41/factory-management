import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select } from 'antd'
import { fetchCustomers } from '../../customers/services/customersService'
import { RequestError } from '../../../components/common/RequestError'

export function LedgerCustomerSelect({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const query = useQuery({ queryKey: ['customers', 'ledger-select', search], queryFn: () => fetchCustomers({ page: 1, page_size: 100, q: search || undefined }) })
  return <><Select aria-label="Chọn khách hàng cho giao dịch" showSearch={{ filterOption: false, onSearch: setSearch }} value={value} placeholder="Tìm theo tên, mã hoặc số điện thoại" loading={query.isFetching} onChange={onChange}
    options={(query.data?.data ?? []).map(row => ({ value: row.id, label: `${row.customerCode} · ${row.name}` }))} notFoundContent={query.error ? 'Không tải được khách hàng' : query.isFetching ? 'Đang tải…' : 'Không tìm thấy khách hàng'} />
    <RequestError error={query.error} retry={() => void query.refetch()} /></>
}
