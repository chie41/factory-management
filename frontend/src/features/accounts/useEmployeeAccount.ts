import { useQuery } from '@tanstack/react-query'
import { usePermissions } from '../auth/hooks/usePermissions'
import type { Employee } from '../employees/types/employee'
import { getData } from './api'
export function useEmployeeAccount(employee: Employee) {
  const { can } = usePermissions()
  const allowed = can('users.create') && can('employees.read')
  const availability = useQuery({
    queryKey: ['employee-account', employee.id],
    queryFn: () => getData<{ has_account: boolean }>(`/employees/${employee.id}/account`),
    enabled: allowed,
    refetchOnWindowFocus: true
  })
  const code = employee.code ?? employee.employeeCode ?? ''
  const reason = availability.isError ? 'Không tải được trạng thái tài khoản' : availability.data?.has_account ? 'Nhân viên đã có tài khoản' : employee.status !== 'ACTIVE' ? 'Nhân viên không hoạt động' : !code ? 'Nhân viên chưa có mã' : availability.isPending ? 'Đang tải trạng thái tài khoản' : undefined
  return { allowed, code, disabled: !allowed || !!reason, reason, hasAccount: !!availability.data?.has_account, loading: availability.isFetching }
}
