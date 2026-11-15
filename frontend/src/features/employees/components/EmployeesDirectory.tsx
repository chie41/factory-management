import { EmployeeRowActions } from './EmployeeRowActions'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Input, Select, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Employee } from '../types/employee'
import { useEmployees } from '../hooks/useEmployees'
import { EmployeeForm } from './EmployeeForm'
import { EmployeeDetail } from './EmployeeDetail'
import { PageFrame } from '../../../components/common/PageFrame'
import { FilterRow } from '../../../components/common/FilterRow'
import { DataTable } from '../../../components/common/DataTable'
import { StatusTag } from '../../../components/common/StatusTag'
import { RequestError } from '../../../components/common/RequestError'
import { dateText } from '../../../utils/format'
export function EmployeesDirectory() {
  const { employeeId } = useParams()
  if (employeeId) return <EmployeeDetail key={employeeId} id={employeeId} />
  return <EmployeeList />
}
function EmployeeList() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const state = useEmployees()
  const [create, setCreate] = useState(false)
  const columns: ColumnsType<Employee> = [
    {
      title: 'NHÂN VIÊN',
      minWidth: 254,
      render: (_, row) => <b>{row.name ?? row.fullName ?? '—'}</b>
    },
    { title: 'MÃ NV', width: 88, render: (_, row) => row.code ?? row.employeeCode ?? '—' },
    { title: 'VAI TRÒ', width: 132, render: (_, row) => row.role || '—' },
    { title: 'SĐT', width: 126, render: (_, row) => row.phone || '—' },
    { title: 'CÔNG VIỆC HIỆN TẠI', minWidth: 222, render: (_, row) => row.currentWork || '—' },
    { title: 'TRẠNG THÁI', width: 162, render: (_, row) => <StatusTag status={row.status ?? ''} /> },
    { title: 'NGÀY VÀO LÀM', width: 106, render: (_, row) => dateText(row.start_date ?? row.startDate) },
    {
      title: 'Thao tác',
      width: 88,
      align: 'center',
      render: (_, row) => <EmployeeRowActions employee={row} />
    }
  ]
  return (
    <PageFrame
      title="Nhân viên"
      subtitle="Quản lý hồ sơ và trạng thái nhân viên"
      action={can('employees.create') ? 'Thêm nhân viên' : undefined}
      onAction={() => setCreate(true)}
    >
      <Typography.Text className="summary-line">
        Tổng {state.data?.meta.total ?? '—'} nhân viên · Đang hoạt động trên trang{' '}
        {state.rows.filter((row) => row.status === 'ACTIVE').length} · Ngừng hoạt động trên trang{' '}
        {state.rows.filter((row) => row.status === 'INACTIVE').length}
      </Typography.Text>
      <FilterRow>
        <Input.Search
          allowClear
          aria-label="Tìm nhân viên"
          placeholder="Tìm tên, mã nhân viên, số điện thoại..."
          onSearch={state.setSearch}
        />
        <Select
          aria-label="Trạng thái nhân viên"
          allowClear
          placeholder="Trạng thái: Tất cả"
          value={state.status}
          onChange={state.setStatus}
          options={[
            { value: 'ACTIVE', label: 'Đang hoạt động' },
            { value: 'INACTIVE', label: 'Ngừng hoạt động' }
          ]}
        />
        <Tooltip title="Contract chưa hỗ trợ bộ lọc vai trò">
          <Select disabled placeholder="Vai trò: Tất cả" />
        </Tooltip>
      </FilterRow>
      <RequestError error={state.error} retry={() => void state.refetch()} />
      <DataTable
        columns={columns}
        dataSource={state.rows}
        loading={state.isFetching}
        rowKey="id"
        onRow={row => ({onDoubleClick: () => navigate(`/employees/${row.id}`), style: {cursor: 'pointer'}})}
        pagination={{
          current: state.page,
          pageSize: state.pageSize,
          total: state.data?.meta.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onChange: (page, size) => {
            state.setPage(page)
            state.setPageSize(size)
          },
          showTotal: (total) => `${total} nhân viên`
        }}
      />
      {create && can('employees.create') && <EmployeeForm close={() => setCreate(false)} />}
    </PageFrame>
  )
}
