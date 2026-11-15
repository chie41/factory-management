import type { ReactNode } from 'react'
import { App, ConfigProvider, theme } from 'antd'
import viVN from 'antd/locale/vi_VN'
import type { ThemeConfig } from 'antd'

const baseTheme: ThemeConfig = {
  token: { colorPrimary: '#1946f2', borderRadius: 6, fontFamily: 'Inter, system-ui, Segoe UI, sans-serif' },
}

export function LoginProvider({ children }: { children: ReactNode }) {
  return <ConfigProvider theme={baseTheme}>{children}</ConfigProvider>
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return <ConfigProvider locale={viVN} theme={{ ...baseTheme, algorithm: theme.defaultAlgorithm, components: { Table: { headerBg: '#f9f9f9', headerColor: '#737373', fontSize: 12, cellPaddingBlock: 12 } } }}><App>{children}</App></ConfigProvider>
}
