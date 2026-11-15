export type Employee = {
  id: string; code?: string; employeeCode?: string; name?: string; fullName?: string
  phone?: string; role?: string; status?: string; start_date?: string; startDate?: string
  currentWork?: string; note?: string
}
export type EmployeeInput = {
  name: string; phone?: string; role?: string; status: 'ACTIVE' | 'INACTIVE'; start_date?: string; note?: string
}
export type EmployeeTab = 'work' | 'payroll' | 'supplies' | 'activity'

