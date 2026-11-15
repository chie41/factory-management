import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Dropdown } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import type { Employee } from '../types/employee'
import { useEmployeeAccount } from '../../accounts/useEmployeeAccount'
import { CreateAccountModal } from '../../accounts/CreateAccountModal'
export function EmployeeRowActions({employee}:{employee:Employee}) {
  const account = useEmployeeAccount(employee)
  const [creating,setCreating] = useState(false)
  return <div onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>
    <Dropdown trigger={['click','hover']} menu={{items:[
      {key:'detail',label:<Link to={`/employees/${employee.id}`}>Xem chi tiết</Link>},
      ...(account.allowed ? [{key:'create-account',label:account.hasAccount?'Đã có tài khoản':'Tạo tài khoản',disabled:account.disabled,title:account.reason}] : [])
    ],onClick:({key})=>{if(key==='create-account'&&!account.disabled)setCreating(true)}}}>
      <Button type="text" icon={<MoreOutlined />} aria-label={`Thao tác nhân viên ${employee.name??employee.fullName??employee.code??''}`} />
    </Dropdown>
    {creating && account.allowed && <CreateAccountModal employee={{id:employee.id,employee_code:account.code,full_name:employee.name??employee.fullName??''}} close={()=>setCreating(false)} />}
  </div>
}
