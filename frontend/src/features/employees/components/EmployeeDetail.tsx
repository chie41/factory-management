import { EmployeeAccountButton } from '../../accounts/EmployeeAccountButton'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Avatar, Button, Card, Descriptions, Skeleton, Space, Tabs, Typography } from 'antd'
import { fetchEmployee } from '../services/employeesService'
import { EmployeeActivity, EmployeePayroll, EmployeeSupplies, EmployeeWork } from './EmployeeTabs'
import { EmployeeForm } from './EmployeeForm'
import { RequestError } from '../../../components/common/RequestError'
import { StatusTag } from '../../../components/common/StatusTag'
import { dateText, initials } from '../../../utils/format'

export function EmployeeDetail({ id }: { id: string }) {
  const { can } = usePermissions()
  const query = useQuery({ queryKey: ['employee', id], queryFn: () => fetchEmployee(id) })
  const [editing, setEditing] = useState(false)
  const employee = query.data
  return (
    <section className="workspace-page employee-detail">
      <Link to="/employees">← Danh sách nhân viên</Link>
      <RequestError error={query.error} retry={() => void query.refetch()} />
      {query.isPending && <Skeleton active />}
      {employee && (
        <>
          <div className="employee-header">
            <Space>
              <Avatar size={44}>{initials(employee.name ?? employee.fullName)}</Avatar>
              <div>
                <Typography.Title level={2}>{employee.name ?? employee.fullName}</Typography.Title>
                <span>
                  {employee.code ?? employee.employeeCode} · {employee.role || '—'}
                </span>
              </div>
            </Space>
            <Space wrap>
              <EmployeeAccountButton employee={employee} />
              <StatusTag status={employee.status ?? ''} />
              {can('employees.update') && <Button onClick={() => setEditing(true)}>Chỉnh sửa hồ sơ</Button>}
            </Space>
          </div>
          <Descriptions
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { key: 'phone', label: 'SĐT', children: employee.phone || '—' },
              { key: 'role', label: 'Vai trò', children: employee.role || '—' },
              { key: 'start', label: 'Ngày vào làm', children: dateText(employee.start_date ?? employee.startDate) }
            ]}
          />
          <Tabs
            destroyOnHidden
            items={[
              {
                key: 'overview',
                label: 'Tổng quan',
                children: (
                  <div className="profile-grid">
                    <Card title="Hồ sơ">
                      <Descriptions
                        column={1}
                        items={[
                          { key: 'code', label: 'Mã nhân viên', children: employee.code ?? employee.employeeCode },
                          { key: 'name', label: 'Họ tên', children: employee.name ?? employee.fullName },
                          { key: 'phone', label: 'SĐT', children: employee.phone || '—' },
                          { key: 'role', label: 'Vai trò', children: employee.role || '—' },
                          {
                            key: 'start',
                            label: 'Ngày vào làm',
                            children: dateText(employee.start_date ?? employee.startDate)
                          },
                          {
                            key: 'status',
                            label: 'Trạng thái',
                            children: <StatusTag status={employee.status ?? ''} />
                          },
                          { key: 'note', label: 'Ghi chú', children: employee.note || '—' }
                        ]}
                      />
                      {can('employees.update') && <Button onClick={() => setEditing(true)}>Chỉnh sửa</Button>}
                    </Card>
                    <Card title="Công việc hiện tại">
                      {employee.currentWork || 'Chưa có thông tin công việc từ máy chủ.'}
                    </Card>
                  </div>
                )
              },
              { key: 'work', label: 'Công việc', children: <EmployeeWork id={id} /> },
              { key: 'payroll', label: 'Lương', children: <EmployeePayroll id={id} /> },
              { key: 'advances', label: 'Ứng / Khấu trừ', children: <EmployeePayroll id={id} deductions /> },
              { key: 'supplies', label: 'Vật dụng', children: <EmployeeSupplies id={id} /> },
              { key: 'activity', label: 'Lịch sử', children: <EmployeeActivity id={id} /> }
            ]}
          />
        </>
      )}
      {editing && employee && can('employees.update') && (
        <EmployeeForm employee={employee} close={() => setEditing(false)} />
      )}
    </section>
  )
}
