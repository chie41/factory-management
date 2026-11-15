import { useMemo, useState } from 'react'
import { Card, Empty, Input, Select, Skeleton, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DataTable } from '../../../components/common/DataTable'
import { RequestError } from '../../../components/common/RequestError'
import { FilterRow } from '../../../components/common/FilterRow'
import { useEmployeeTab } from '../hooks/useEmployeeTab'
import { currencyText, decimalText, weightText } from '../../../utils/decimal'
import { dateText } from '../../../utils/format'
import type { ActivityRow, PayrollLine, SuppliesRow, WorkRow } from '../types/readModels'

const workLabels = { HOLDING: 'Đang giữ', SETTLED: 'Đã quyết toán', CANCELLED: 'Đã hủy' }
export function EmployeeWork({ id }: { id: string }) {
  const query = useEmployeeTab(id, 'work')
  const [status, setStatus] = useState<string>()
  const [search, setSearch] = useState('')
  const rows = (query.data?.data.assignments ?? []).filter(row => (!status || row.status === status) && (row.assignment_code + ' ' + row.description).toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const columns: ColumnsType<WorkRow> = [
    { title: 'NGÀY', width: 100, render: (_, row) => dateText(row.assignment_date) },
    { title: 'MÃ GIAO VIỆC', dataIndex: 'assignment_code', width: 150 }, { title: 'CÔNG VIỆC', dataIndex: 'description', minWidth: 230 },
    { title: 'VÀNG GIAO', width: 120, render: (_, row) => weightText(row.gold_issued_g) },
    { title: 'NHẬN LẠI', width: 120, render: (_, row) => weightText(row.gold_received_g) },
    { title: 'HAO / HEO', width: 112, render: (_, row) => weightText(row.variance_g) },
    { title: 'TIỀN CÔNG', width: 110, render: (_, row) => currencyText(row.labor_amount, row.currency) },
    { title: 'TRẠNG THÁI', width: 210, render: (_, row) => workLabels[row.status] ?? row.status },
  ]
  return <div className="picker"><FilterRow><Input aria-label="Tìm công việc" placeholder="Tìm mã giao việc, công việc" value={search} onChange={event => setSearch(event.target.value)} />
    <Select allowClear placeholder="Trạng thái: Tất cả" value={status} onChange={setStatus} options={Object.entries(workLabels).map(([value, label]) => ({ value, label }))} /></FilterRow>
    <RequestError error={query.error} retry={() => void query.refetch()} /><DataTable rowKey="id" columns={columns} dataSource={rows} loading={query.isFetching} /></div>
}
const payrollLabels: Record<string, string> = { LABOR: 'Tiền công', BONUS: 'Thưởng', ALLOWANCE: 'Phụ cấp', ADVANCE: 'Ứng lương', SUPPLIES: 'Mua vật dụng', PENALTY: 'Phạt / khác', GOLD_VARIANCE: 'Hao vàng', RECOVERY: 'Bù / thu hồi' }
export function EmployeePayroll({ id, deductions = false }: { id: string; deductions?: boolean }) {
  const query = useEmployeeTab(id, 'payroll')
  const [periodId, setPeriodId] = useState<string>()
  const [type, setType] = useState<string>()
  const periods = useMemo(() => query.data?.data.periods ?? [], [query.data])
  const period = periods.find(row => row.id === periodId) ?? periods[0]
  const rows = (period?.lines ?? []).filter(row => (!deductions || ['ADVANCE', 'SUPPLIES', 'PENALTY', 'GOLD_VARIANCE', 'RECOVERY'].includes(row.type)) && (!type || row.type === type))
  const columns: ColumnsType<PayrollLine> = [
    { title: 'NGÀY', width: 100, render: (_, row) => dateText(row.date) },
    { title: 'LOẠI', width: 160, render: (_, row) => payrollLabels[row.type] ?? row.type }, { title: 'NỘI DUNG / REF', minWidth: 300, render: (_, row) => <div>{row.description}<div>{row.reference}</div></div> },
    ...(deductions ? [{ title: 'GIÁ TRỊ GỐC', width: 150, render: (_: unknown, row: PayrollLine) => currencyText(row.original_amount, row.original_currency) }] : []),
    { title: 'NGUỒN', dataIndex: 'source', width: 180 }, { title: 'SỐ TIỀN (THB)', width: 150, render: (_, row) => currencyText(row.amount_thb, 'THB') },
    { title: 'TRẠNG THÁI', dataIndex: 'status', width: 180 },
  ]
  const labels = { labor: 'Tiền công', bonus: 'Thưởng', allowance: 'Phụ cấp', advance: 'Ứng', supplies: 'Mua vật dụng', penalty: 'Phạt / khác', gold_variance: 'Hao vàng', net: 'Thực nhận' }
  return <div className="picker"><FilterRow><Select aria-label="Kỳ lương" placeholder="Chọn kỳ lương" value={period?.id} onChange={setPeriodId} options={periods.map(row => ({ value: row.id, label: row.name }))} />
    {deductions && <Select aria-label="Loại khấu trừ" placeholder="Loại: Tất cả" allowClear value={type} onChange={setType} options={['ADVANCE', 'SUPPLIES', 'PENALTY', 'GOLD_VARIANCE', 'RECOVERY'].map(value => ({ value, label: payrollLabels[value] }))} />}</FilterRow>
    <RequestError error={query.error} retry={() => void query.refetch()} />
    {query.isPending && <Skeleton active />}
    {period && !deductions && <Card title="Tổng kết theo Sổ lương thợ"><div className="payroll-summary">{Object.entries(labels).map(([key, label]) => <div key={key}><span>{label}</span><b>{decimalText(period.summary_thb[key as keyof typeof labels])} THB</b></div>)}</div></Card>}
    {query.isSuccess && !period ? <Empty description="Chưa có kỳ lương" /> : <DataTable rowKey="id" columns={columns} dataSource={rows} loading={query.isFetching} />}
  </div>
}
export function EmployeeSupplies({ id }: { id: string }) {
  const query = useEmployeeTab(id, 'supplies')
  const heldColumns: ColumnsType<SuppliesRow> = [
    { title: 'VẬT DỤNG', dataIndex: 'supply_name', minWidth: 240 }, { title: 'SL', dataIndex: 'quantity', width: 64 },
    { title: 'NGÀY NHẬN', width: 150, render: (_, row) => dateText(row.date) }, { title: 'HÌNH THỨC', dataIndex: 'transaction_type', width: 180 },
    { title: 'REFERENCE', dataIndex: 'reference', width: 240 },
  ]
  const historyColumns: ColumnsType<SuppliesRow> = [
    { title: 'NGÀY', width: 100, render: (_, row) => dateText(row.date) }, ...heldColumns.slice(0, 2),
    { title: 'GIÁ TRỊ', width: 150, render: (_, row) => currencyText(row.amount, row.currency) },
    { title: 'THANH TOÁN', width: 180, render: (_, row) => row.payment_method === 'PAYROLL_DEDUCTION' ? 'Trừ vào lương' : row.payment_method === 'IMMEDIATE' ? 'Thanh toán ngay' : row.payment_method },
    { title: 'NGUỒN', dataIndex: 'reference', width: 240 },
  ]
  return <div className="picker"><RequestError error={query.error} retry={() => void query.refetch()} />
    <Typography.Title level={5}>Vật dụng đang giữ</Typography.Title><DataTable rowKey="id" columns={heldColumns} dataSource={query.data?.data.held ?? []} loading={query.isFetching} />
    <Typography.Title level={5}>Lịch sử vật dụng</Typography.Title><DataTable rowKey="id" columns={historyColumns} dataSource={query.data?.data.history ?? []} loading={query.isFetching} /></div>
}
export function EmployeeActivity({ id }: { id: string }) {
  const query = useEmployeeTab(id, 'activity')
  return <div className="picker"><RequestError error={query.error} retry={() => void query.refetch()} />
    <DataTable<ActivityRow> rowKey="id" columns={[
      { title: 'THỜI GIAN', width: 190, render: (_, row) => new Date(row.occurred_at).toLocaleString('vi-VN') },
      { title: 'THAY ĐỔI', dataIndex: 'description', minWidth: 300 }, { title: 'NGƯỜI THỰC HIỆN', dataIndex: 'actor_name', width: 242 },
    ]} dataSource={query.data?.data ?? []} loading={query.isFetching} pagination={{ current: query.page, pageSize: query.pageSize, total: query.data?.meta?.total ?? 0, showSizeChanger: true, onChange: (page, size) => { query.setPage(page); query.setPageSize(size) } }} /></div>
}

