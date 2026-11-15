import { useEffect, type ReactNode } from 'react'
import { PermissionContext, usePermissions } from '../hooks/usePermissions'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Result, Spin } from 'antd'
import { apiClient } from '../../../services/apiClient'
import { errorText } from '../../../services/apiErrors'
export type EffectivePermission = {
  id: string
  code: string
  name: string
  sources: { type: 'role' | 'group' | 'direct'; id: string; name: string }[]
}

export function PermissionProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['auth-permissions'],
    queryFn: async () => (await apiClient.get<{ data: EffectivePermission[] }>('/auth/me/permissions')).data.data,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0
  })
  const { refetch } = query
  useEffect(() => {
    const refresh = () => void refetch()
    window.addEventListener('auth:permissions-stale', refresh)
    return () => window.removeEventListener('auth:permissions-stale', refresh)
  }, [refetch])
  if (query.isPending) return <Spin fullscreen tip="Đang tải quyền truy cập…" />
  if (query.isError)
    return (
      <Alert
        type="error"
        title={errorText(query.error)}
        action={<Button onClick={() => void query.refetch()}>Thử lại</Button>}
      />
    )
  return <PermissionContext.Provider value={query.data.map((p) => p.code)}>{children}</PermissionContext.Provider>
}
export function PermissionRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = usePermissions()
  return can(permission) ? (
    children
  ) : (
    <Result status="403" title="403" subTitle="Bạn không có quyền truy cập trang này." />
  )
}
