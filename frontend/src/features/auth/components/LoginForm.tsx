import { useState } from 'react'
import { UserOutlined } from '@ant-design/icons'
import { Button, Form, Input } from 'antd'
import type { LoginCredentials } from '../types/auth'
import { RequestError } from '../../../components/common/RequestError'
export function LoginForm({ onLogin }: { onLogin: (values: LoginCredentials) => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submit = async (values: LoginCredentials) => {
    setPending(true); setError(null)
    try { await onLogin(values) } catch (cause) { setError(cause) } finally { setPending(false) }
  }
  return <Form layout="vertical" onFinish={submit} requiredMark={false} disabled={pending}>
    <RequestError error={error} />
    <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, whitespace: true, message: 'Nhập tên đăng nhập' }, { max: 100 }]}><Input size="large" prefix={<UserOutlined />} autoComplete="username" /></Form.Item>
    <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}><Input.Password size="large" autoComplete="current-password" /></Form.Item>
    <Button type="primary" htmlType="submit" size="large" block loading={pending}>Đăng nhập</Button>
  </Form>
}

