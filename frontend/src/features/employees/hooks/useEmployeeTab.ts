import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEmployeeTab } from '../services/employeesService'
import type { EmployeeTab } from '../types/employee'
export function useEmployeeTab<T extends EmployeeTab>(id: string, tab: T) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery({ queryKey: ['employee', id, tab, page, pageSize], queryFn: () => fetchEmployeeTab(id, tab, { page, page_size: pageSize }) })
  return { ...query, page, pageSize, setPage, setPageSize }
}

