import { Button, Input } from 'antd'
import { useCustomers } from '../hooks/useCustomers'
import { RequestError } from '../../../components/common/RequestError'
import { DataTable } from '../../../components/common/DataTable'
export function CustomerPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const state = useCustomers()
  return <div className="picker"><Input.Search aria-label="Tìm khách hàng để mở sổ" placeholder="Tìm tên, mã, số điện thoại" onSearch={state.setSearch} allowClear />
    <RequestError error={state.error} retry={() => void state.refetch()} />
    <DataTable rowKey="id" loading={state.isFetching} dataSource={state.rows} columns={[
      { title: 'Khách hàng', render: (_, row) => <div><b>{row.name}</b><div>{row.customerCode}</div></div> },
      { title: '', render: (_, row) => <Button type="link" onClick={() => onSelect(row.id)}>Chọn</Button> },
    ]} pagination={{ current: state.page, pageSize: state.pageSize, total: state.data?.meta.total ?? 0, onChange: state.setPage }} />
  </div>
}

