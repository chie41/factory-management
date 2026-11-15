import { createContext, useContext } from 'react'
export const PermissionContext = createContext<string[]>([])
export function usePermissions() {
  const codes = useContext(PermissionContext)
  const can = (code: string) => codes.includes(code)
  return {
    can,
    canAny: (permissions: string[]) => permissions.some(can),
    canAll: (permissions: string[]) => permissions.every(can)
  }
}
