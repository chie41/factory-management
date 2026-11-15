import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCustomers } from '../services/customersService'

export function useCustomers() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery({ queryKey: ['customers', page, pageSize, search], queryFn: () => fetchCustomers({ page, page_size: pageSize, q: search || undefined }) })
  return { ...query, rows: query.data?.data ?? [], search, setSearch: (value: string) => { setSearch(value); setPage(1) }, page, pageSize, setPage, setPageSize }
}

