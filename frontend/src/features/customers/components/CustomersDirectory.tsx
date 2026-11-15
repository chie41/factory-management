import { CustomerLaborPrices } from './CustomerLaborPrices'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Descriptions, Drawer, Input, Popconfirm, Space, Spin, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Customer } from '../types/customer'
import { useCustomers } from '../hooks/useCustomers'
import { deleteCustomer, fetchCustomer } from '../services/customersService'
import { CustomerForm } from './CustomerForm'
import { documentedContract } from '../../../services/apiContract'
import { PageFrame } from '../../../components/common/PageFrame'
import { FilterRow } from '../../../components/common/FilterRow'
import { DataTable } from '../../../components/common/DataTable'
import { StatusTag } from '../../../components/common/StatusTag'
import { RequestError } from '../../../components/common/RequestError'

export function CustomersDirectory() {
  const { can } = usePermissions()
  const query = useCustomers()
  const cache = useQueryClient()
  const { message } = App.useApp()
  const [editor, setEditor] = useState<Customer | 'new' | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [duplicateDetail, setDuplicateDetail] = useState(false)
  const detail = useQuery({ queryKey: ['customer', detailId], queryFn: () => fetchCustomer(detailId!), enabled: !!detailId })
  const refresh = () => { void cache.invalidateQueries({ queryKey: ['customers'] }); void cache.invalidateQueries({ queryKey: ['customer'] }); void cache.invalidateQueries({ queryKey: ['ledger'] }) }
  const remove = useMutation({ mutationFn: deleteCustomer, onSuccess: () => { refresh(); setDetailId(null); message.success('Đã xóa khách hàng'); if (query.rows.length === 1 && query.page > 1) query.setPage(query.page - 1) } })
  const openEditor = (customer: Customer | 'new') => { setDuplicateDetail(false); setEditor(customer) }
  const columns: ColumnsType<Customer> = [
    { title: 'KHÁCH HÀNG', minWidth: 230, render: (_, row) => <strong>{row.name ?? '—'}</strong> },
    { title: 'MÃ KH', dataIndex: 'customerCode', width: 120 },
    { title: 'SĐT', width: 150, render: (_, row) => row.phone || '—' },
    { title: 'ĐỊA CHỈ', minWidth: 240, render: (_, row) => row.address || '—' },
    ...(!documentedContract ? [{ title: 'TRẠNG THÁI', width: 160, render: (_: unknown, row: Customer) => <StatusTag status={row.status ?? ''} /> }] : []),
    { title: 'HÀNH ĐỘNG', width: 180, render: (_, row) => <Space><Button type="link" onClick={() => { remove.reset(); setDetailId(row.id) }}>Xem</Button><Link to={`/ledger/${row.id}`}>Mở sổ →</Link></Space> },
  ]
  return <PageFrame title="Khách hàng" subtitle="Quản lý hồ sơ và thông tin liên hệ khách hàng" action={can('customers.create') ? 'Thêm khách hàng' : undefined} onAction={() => openEditor('new')}>
    <Typography.Text className="summary-line">Tổng {query.data?.meta.total ?? '—'} khách hàng</Typography.Text>
    <FilterRow><Input.Search allowClear aria-label="Tìm khách hàng" placeholder="Tìm tên, mã khách hàng, số điện thoại..." onSearch={query.setSearch} enterButton /></FilterRow>
    <RequestError error={query.error} retry={() => void query.refetch()} />
    <RequestError error={remove.error} />
    <DataTable columns={columns} dataSource={query.rows} loading={query.isFetching} rowKey="id" pagination={{ current: query.page, pageSize: query.pageSize, total: query.data?.meta.total ?? 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], onChange: (page, size) => { query.setPage(page); query.setPageSize(size) }, showTotal: total => `${total} khách hàng` }} />
    <Drawer zIndex={duplicateDetail ? 1200 : undefined} title="Hồ sơ khách hàng" open={!!detailId} onClose={() => { setDetailId(null); setDuplicateDetail(false) }} size="large">
      <RequestError error={detail.error} retry={() => void detail.refetch()} />
      {detail.isPending ? <Spin /> : detail.data && <><Descriptions column={1} items={[
        { key: 'code', label: 'Mã khách hàng', children: detail.data.customerCode }, { key: 'name', label: 'Tên', children: detail.data.name },
        { key: 'phone', label: 'SĐT', children: detail.data.phone || '—' }, { key: 'address', label: 'Địa chỉ', children: detail.data.address || '—' },
        ...(!documentedContract ? [{ key: 'status', label: 'Trạng thái', children: <StatusTag status={detail.data.status ?? ''} /> }] : []), { key: 'note', label: 'Ghi chú', children: detail.data.note || '—' },
      ]} /><Space wrap>{can('customers.update') && <Button onClick={() => openEditor(detail.data!)}>Chỉnh sửa</Button>}<Link to={`/ledger/${detail.data.id}`}>Mở sổ giao dịch →</Link>{can('customers.delete') && <Popconfirm title="Xóa khách hàng?" description="Khách hàng sẽ được xóa mềm khỏi danh sách." onConfirm={() => remove.mutate(detail.data!.id)} okButtonProps={{ loading: remove.isPending }}><Button danger loading={remove.isPending}>Xóa khách hàng</Button></Popconfirm>}</Space><CustomerLaborPrices key={detail.data.id} customerId={detail.data.id} /></>}
    </Drawer>
    {editor && can(editor === 'new' ? 'customers.create' : 'customers.update') && <CustomerForm key={editor === 'new' ? 'new' : editor.id} inspect={id => { setDuplicateDetail(true); setDetailId(id) }} customer={editor === 'new' ? undefined : editor} close={() => setEditor(null)} />}
  </PageFrame>
}




