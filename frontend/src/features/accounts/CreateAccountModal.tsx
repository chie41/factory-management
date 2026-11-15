import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Form, Input, Modal, Select } from 'antd'
import { usePermissions } from '../auth/hooks/usePermissions'
import { RequestError } from '../../components/common/RequestError'
import { getData, write, type Access, type Employee, type Permission } from './api'
import { PermissionMatrix } from './PermissionMatrix'
import { errorText } from '../../services/apiErrors'
const statuses = [
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'LOCKED', label: 'Đã khóa' }
]
const options = (rows: Access[]) => rows.map((r) => ({ value: r.id, label: r.name }))
export function CreateAccountModal({ employee, close }: { employee?: Employee; close: () => void }) {
  const { can } = usePermissions(),
    cache = useQueryClient(),
    { message } = App.useApp(),
    [createForm] = Form.useForm()
  const employees = useQuery({
    queryKey: ['eligible-employees'],
    queryFn: () => getData<Employee[]>('/users/eligible-employees'),
    enabled: !employee
  })
  const groups = useQuery({
    queryKey: ['access', 'groups'],
    queryFn: () => getData<Access[]>('/groups'),
    enabled: can('users.groups.manage')
  })
  const roles = useQuery({
    queryKey: ['access', 'roles'],
    queryFn: () => getData<Access[]>('/roles'),
    enabled: can('users.roles.manage')
  })
  const catalog = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: () => getData<Permission[]>('/permissions/catalog'),
    enabled: can('users.permissions.manage')
  })
  const save = useMutation({
    mutationFn: (data: object) => write('post', '/users', data),
    onSuccess: async () => {
      await Promise.all(
        ['accounts', 'eligible-employees', 'employee-account', 'access'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] })
        )
      )
      message.success('Đã tạo tài khoản')
    },
    onError: (e) => message.error(errorText(e))
  })
  return (
    <Modal
      title="Tạo tài khoản"
      open
      width={760}
      onCancel={close}
      onOk={() => createForm.submit()}
      confirmLoading={save.isPending}
      okText="Tạo tài khoản"
      cancelText="Hủy"
      destroyOnHidden
    >
      <RequestError error={employees.error} />
      <Form
        form={createForm}
        layout="vertical"
        initialValues={{
          status: 'ACTIVE',
          role_ids: [],
          permission_ids: [],
          employee_id: employee?.id,
          username: employee?.employee_code
        }}
        onFinish={async (values) => {
          const { confirm, ...data } = values
          void confirm
          await save.mutateAsync(data)
          close()
        }}
      >
        <Form.Item name="employee_id" label="Nhân viên" rules={[{ required: true }]}>
          <Select
            showSearch
            disabled={!!employee}
            onChange={(id) =>
              createForm.setFieldsValue({ username: employees.data?.find((e) => e.id === id)?.employee_code ?? '' })
            }
            optionFilterProp="label"
            loading={employees.isFetching}
            options={(employee ? [employee] : (employees.data ?? [])).map((e) => ({
              value: e.id,
              label: `${e.employee_code} · ${e.full_name}`
            }))}
          />
        </Form.Item>
        <Form.Item
          name="username"
          label="Username (bất biến, phân biệt hoa/thường)"
          rules={[{ required: true, whitespace: true, max: 100 }]}
        >
          <Input maxLength={100} autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Mật khẩu ban đầu"
          rules={[{ required: true, min: 6, whitespace: true, max: 256 }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Xác nhận mật khẩu"
          dependencies={['password']}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator: (_, v) =>
                v === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu không khớp'))
            })
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="status" label="Trạng thái">
          <Select options={statuses} />
        </Form.Item>
        {can('users.groups.manage') && (
          <Form.Item name="group_id" label="Nhóm">
            <Select allowClear options={options(groups.data ?? [])} />
          </Form.Item>
        )}
        {can('users.roles.manage') && (
          <Form.Item name="role_ids" label="Vai trò">
            <Select mode="multiple" options={options(roles.data ?? [])} />
          </Form.Item>
        )}
        {can('users.permissions.manage') && (
          <Form.Item name="permission_ids" label="Quyền bổ sung">
            <PermissionMatrix catalog={catalog.data ?? []} value={[]} onChange={() => {}} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
