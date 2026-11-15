import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEmployees } from '../services/employeesService'
export function useEmployees() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery({ queryKey: ['employees', page, pageSize, search, status], queryFn: () => fetchEmployees({ page, page_size: pageSize, q: search || undefined, status }) })
  return { ...query, rows: query.data?.data ?? [], search, setSearch: (value: string) => { setSearch(value); setPage(1) },
    status, setStatus: (value?: string) => { setStatus(value); setPage(1) }, page, pageSize, setPage, setPageSize }
}

