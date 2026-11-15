import { useState } from 'react'
import { Button, Tooltip } from 'antd'
import type { Employee } from '../employees/types/employee'
import { CreateAccountModal } from './CreateAccountModal'
import { useEmployeeAccount } from './useEmployeeAccount'
export function EmployeeAccountButton({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false)
  const account = useEmployeeAccount(employee)
  if (!account.allowed) return null
  return <>
    <Tooltip title={account.reason}><Button disabled={account.disabled} loading={account.loading} onClick={() => setOpen(true)}>{account.hasAccount ? 'Đã có tài khoản' : 'Tạo tài khoản'}</Button></Tooltip>
    {open && <CreateAccountModal employee={{id:employee.id,employee_code:account.code,full_name:employee.name??employee.fullName??''}} close={() => setOpen(false)} />}
  </>
}
