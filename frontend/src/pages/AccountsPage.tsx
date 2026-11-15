import { getData, write, type Access, type Account, type Permission } from '../features/accounts/api'
import { CreateAccountModal } from '../features/accounts/CreateAccountModal'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PageFrame } from '../components/common/PageFrame'
import { RequestError } from '../components/common/RequestError'
import { usePermissions } from '../features/auth/hooks/usePermissions'
import { PermissionMatrix } from '../features/accounts/PermissionMatrix'
import { apiClient } from '../services/apiClient'
import { errorText } from '../services/apiErrors'
const statuses = [
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'LOCKED', label: 'Đã khóa' }
]
const options = (rows: { id: string; name: string }[]) => rows.map((r) => ({ value: r.id, label: r.name }))
export function AccountsPage() {
  const { can } = usePermissions(),
    cache = useQueryClient(),
    { message } = App.useApp()
  const [filters, setFilters] = useState<{
    q?: string
    group_id?: string
    role_id?: string
    status?: string
    page: number
    page_size: number
  }>({ page: 1, page_size: 20 })
  const [detailId, setDetailId] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const [accessEdit, setAccessEdit] = useState<{ kind: 'groups' | 'roles'; item?: Access } | null>(null)
  const accounts = useQuery({
    queryKey: ['accounts', filters],
    queryFn: async () =>
      (await apiClient.get<{ data: Account[]; meta: { total: number } }>('/users', { params: filters })).data
  })
  const groups = useQuery({ queryKey: ['access', 'groups'], queryFn: () => getData<Access[]>('/groups') })
  const roles = useQuery({ queryKey: ['access', 'roles'], queryFn: () => getData<Access[]>('/roles') })
  const catalog = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: () => getData<Permission[]>('/permissions/catalog')
  })
  const detail = useQuery({
    queryKey: ['account', detailId],
    queryFn: () => getData<Account>('/users/' + detailId),
    enabled: !!detailId
  })
  const refresh = async () => {
    await Promise.all(
      ['accounts', 'account', 'access', 'eligible-employees', 'auth-permissions'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] })
      )
    )
  }
  const mutation = useMutation({
    mutationFn: ({ method, url, data }: { method: 'post' | 'patch' | 'put' | 'delete'; url: string; data: object }) =>
      write(method, url, data),
    onSuccess: async () => {
      await refresh()
      message.success('Đã lưu thay đổi')
    },
    onError: (e) => message.error(errorText(e))
  })
  const run = async (method: 'post' | 'patch' | 'put' | 'delete', url: string, data: object) =>
    mutation.mutateAsync({ method, url, data })
  const filter = (values: object) => setFilters((f) => ({ ...f, ...values, page: 1 }))
  const columns: ColumnsType<Account> = [
    { title: 'Tên đăng nhập', dataIndex: 'username' },
    { title: 'Nhân viên', render: (_, r) => r.full_name ?? 'Không liên kết' },
    { title: 'Mã NV', dataIndex: 'employee_code' },
    { title: 'Nhóm', render: (_, r) => r.group?.name ?? '—' },
    { title: 'Vai trò', render: (_, r) => r.roles.map((x) => <Tag key={x.id}>{x.name}</Tag>) },
    { title: 'Quyền riêng', render: (_, r) => r.direct_permission_ids.length },
    {
      title: 'Trạng thái',
      render: (_, r) => (
        <Tag color={r.status === 'ACTIVE' ? 'green' : r.status === 'LOCKED' ? 'red' : 'default'}>
          {r.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
        </Tag>
      )
    },
    {
      title: 'Thao tác',
      render: (_, r) => (
        <Button type="link" onClick={() => setDetailId(r.id)}>
          Chi tiết
        </Button>
      )
    }
  ]
  const accessTable = (kind: 'groups' | 'roles', rows: Access[], loading: boolean) => (
    <>
      <Space style={{ marginBottom: 16 }}>
        {can(`${kind}.manage`) && (
          <Button type="primary" onClick={() => setAccessEdit({ kind })}>
            Tạo {kind === 'groups' ? 'nhóm' : 'vai trò'}
          </Button>
        )}
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 650 }}
        columns={[
          { title: 'Mã', dataIndex: 'code' },
          { title: 'Tên', dataIndex: 'name' },
          { title: 'Thành viên', dataIndex: 'member_count' },
          { title: 'Permission', render: (_, r: Access) => r.permissions.length },
          { title: 'Loại', render: (_, r: Access) => (r.system ? <Tag color="blue">Hệ thống</Tag> : 'Thông thường') },
          {
            title: 'Thao tác',
            render: (_, r: Access) => (
              <Space>
                <Button onClick={() => setAccessEdit({ kind, item: r })}>Xem / sửa</Button>
                {can(`${kind}.manage`) && !r.system && (
                  <Popconfirm
                    title="Xóa nhóm / vai trò?"
                    description="Chỉ xóa được khi không còn thành viên."
                    onConfirm={() => run('delete', `/${kind}/${r.id}`, { version: r.version })}
                  >
                    <Button danger disabled={r.member_count > 0}>
                      Xóa
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            )
          }
        ]}
      />
    </>
  )
  return (
    <PageFrame title="Quản lý tài khoản" subtitle="Tài khoản đăng nhập, nhóm quyền và vai trò">
      <RequestError
        error={accounts.error || groups.error || roles.error || catalog.error}
        retry={() => void refresh()}
      />
      <Tabs
        items={[
          {
            key: 'accounts',
            label: 'Tài khoản',
            children: (
              <>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Input.Search
                    placeholder="Username, tên hoặc mã nhân viên"
                    allowClear
                    onSearch={(q) => filter({ q })}
                  />
                  <Select
                    style={{ width: 170 }}
                    allowClear
                    placeholder="Nhóm"
                    options={options(groups.data ?? [])}
                    onChange={(group_id) => filter({ group_id })}
                  />
                  <Select
                    style={{ width: 170 }}
                    allowClear
                    placeholder="Vai trò"
                    options={options(roles.data ?? [])}
                    onChange={(role_id) => filter({ role_id })}
                  />
                  <Select
                    style={{ width: 160 }}
                    allowClear
                    placeholder="Trạng thái"
                    options={statuses}
                    onChange={(status) => filter({ status })}
                  />
                  {can('users.create') && (
                    <Button
                      type="primary"
                      onClick={() => {
                        setCreating(true)
                      }}
                    >
                      Tạo tài khoản
                    </Button>
                  )}
                </Space>
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={accounts.data?.data ?? []}
                  loading={accounts.isFetching}
                  scroll={{ x: 1100 }}
                  pagination={{
                    current: filters.page,
                    pageSize: filters.page_size,
                    total: accounts.data?.meta.total ?? 0,
                    showSizeChanger: true,
                    onChange: (page, page_size) => setFilters((f) => ({ ...f, page, page_size }))
                  }}
                />
              </>
            )
          },
          { key: 'groups', label: 'Nhóm quyền', children: accessTable('groups', groups.data ?? [], groups.isFetching) },
          { key: 'roles', label: 'Vai trò', children: accessTable('roles', roles.data ?? [], roles.isFetching) }
        ]}
      />
      {creating && <CreateAccountModal close={() => setCreating(false)} />}
      <Drawer
        title="Chi tiết tài khoản"
        open={!!detailId}
        onClose={() => setDetailId(null)}
        size="large"
        destroyOnHidden
        loading={detail.isFetching}
      >
        <RequestError error={detail.error} retry={() => void detail.refetch()} />
        {detail.data && (
          <AccountDetail
            key={detail.data.version}
            account={detail.data}
            groups={groups.data ?? []}
            roles={roles.data ?? []}
            catalog={catalog.data ?? []}
            run={run}
            close={() => setDetailId(null)}
            busy={mutation.isPending}
          />
        )}
      </Drawer>
      {accessEdit && (
        <AccessEditor
          key={`${accessEdit.kind}-${accessEdit.item?.version ?? 'new'}`}
          {...accessEdit}
          catalog={catalog.data ?? []}
          accounts={accounts.data?.data ?? []}
          run={run}
          close={() => setAccessEdit(null)}
          busy={mutation.isPending}
          openAccount={(id) => {
            setAccessEdit(null)
            setDetailId(id)
          }}
        />
      )}
    </PageFrame>
  )
}
type Run = (method: 'post' | 'patch' | 'put' | 'delete', url: string, data: object) => Promise<unknown>
function AccountDetail({
  account: a,
  groups,
  roles,
  catalog,
  run,
  close,
  busy
}: {
  account: Account
  groups: Access[]
  roles: Access[]
  catalog: Permission[]
  run: Run
  close: () => void
  busy: boolean
}) {
  const { can } = usePermissions(),
    { modal } = App.useApp()
  const [group, setGroup] = useState<string | null>(a.group?.id ?? null),
    [roleIds, setRoleIds] = useState(a.roles.map((r) => r.id)),
    [permissionIds, setPermissionIds] = useState(a.direct_permission_ids)
  const [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [reset, setReset] = useState(false)
  const effectiveCatalog = [...catalog, ...a.effective_permissions.filter((p) => !catalog.some((c) => c.id === p.id))]
  const save = (path: string, data: object, method: 'patch' | 'put' = 'put') =>
    run(method, `/users/${a.id}${path}`, { ...data, version: a.version })
  const confirmStatus = (status: string) =>
    modal.confirm({
      title: `Chuyển tài khoản sang ${status}?`,
      content: 'Các quyền đã gán vẫn được giữ nguyên.',
      onOk: () => save('/status', { status }, 'patch')
    })
  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Descriptions
        title="Thông tin tài khoản"
        column={1}
        items={[
          { key: 'u', label: 'Username', children: a.username },
          { key: 'e', label: 'Nhân viên', children: a.full_name ?? 'Không liên kết' },
          { key: 's', label: 'Trạng thái', children: a.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa' }
        ]}
      />
      <Space wrap>
        {can('users.status.manage') &&
          statuses
            .filter((s) => s.value !== a.status)
            .map((s) => (
              <Button key={s.value} loading={busy} onClick={() => confirmStatus(s.value)}>
                {s.label}
              </Button>
            ))}
        {can('users.password.reset') && <Button onClick={() => setReset(true)}>Đặt lại mật khẩu</Button>}
        {can('users.delete') && (
          <Popconfirm
            title="Xóa mềm tài khoản?"
            onConfirm={async () => {
              await run('delete', `/users/${a.id}`, { version: a.version })
              close()
            }}
          >
            <Button danger>Xóa tài khoản</Button>
          </Popconfirm>
        )}
      </Space>
      {a.can_join_group && <>
      <Typography.Title level={5}>Nhóm quyền (tối đa một)</Typography.Title>
      <Space>
        <Select
          style={{ width: 250 }}
          allowClear
          disabled={!can('users.groups.manage')}
          value={group ?? undefined}
          onChange={(v) => setGroup(v ?? null)}
          options={options(groups)}
        />
        {can('users.groups.manage') && (
          <Button loading={busy} onClick={() => save('/group', { group_id: group })}>
            Lưu nhóm
          </Button>
        )}
      </Space>
      </>}
      <Typography.Title level={5}>Vai trò</Typography.Title>
      <Select
        style={{ width: '100%' }}
        mode="multiple"
        disabled={!can('users.roles.manage')}
        value={roleIds}
        onChange={setRoleIds}
        options={options(roles)}
      />
      {can('users.roles.manage') && (
        <Button loading={busy} onClick={() => save('/roles', { role_ids: roleIds })}>
          Lưu vai trò
        </Button>
      )}
      <Typography.Title level={5}>Quyền cấp riêng</Typography.Title>
      <PermissionMatrix
        catalog={effectiveCatalog}
        value={permissionIds}
        onChange={setPermissionIds}
        disabled={!can('users.permissions.manage')}
      />
      {can('users.permissions.manage') && (
        <Button loading={busy} onClick={() => save('/direct-permissions', { permission_ids: permissionIds })}>
          Lưu quyền riêng
        </Button>
      )}
      <Typography.Title level={5}>Quyền hiệu lực và nguồn cấp</Typography.Title>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        scroll={{ x: 600 }}
        dataSource={effectiveCatalog.map((p) => ({
          ...p,
          sources: a.effective_permissions.find((e) => e.id === p.id)?.sources ?? []
        }))}
        columns={[
          { title: 'Permission', dataIndex: 'code' },
          { title: 'Tên', dataIndex: 'name' },
          {
            title: 'Group',
            render: (_, p) =>
              p.sources
                .filter((s) => s.type === 'group')
                .map((s) => s.name)
                .join(', ') || '—'
          },
          {
            title: 'Role',
            render: (_, p) =>
              p.sources
                .filter((s) => s.type === 'role')
                .map((s) => s.name)
                .join(', ') || '—'
          },
          { title: 'Cấp riêng', render: (_, p) => (p.sources.some((s) => s.type === 'direct') ? '✓' : '—') },
          { title: 'Hiệu lực', render: (_, p) => (p.sources.length ? '✓' : '—') }
        ]}
      />
      <Modal
        title="Đặt lại mật khẩu"
        open={reset}
        onCancel={() => {
          setReset(false)
          setPassword('')
          setConfirm('')
        }}
        okButtonProps={{ disabled: password.length < 6 || !password.trim() || password !== confirm }}
        confirmLoading={busy}
        onOk={async () => {
          await save('/password', { new_password: password }, 'patch')
          setReset(false)
          setPassword('')
          setConfirm('')
        }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Input.Password
            placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
            autoComplete="new-password"
            maxLength={256}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input.Password
            placeholder="Xác nhận mật khẩu"
            autoComplete="new-password"
            maxLength={256}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Alert type="info" title="Phiên đăng nhập cũ sẽ bị thu hồi." />
        </Space>
      </Modal>
    </Space>
  )
}
function AccessEditor({kind,item,catalog,accounts,run,close,busy,openAccount}:{kind:'groups'|'roles';item?:Access;catalog:Permission[];accounts:Account[];run:Run;close:()=>void;busy:boolean;openAccount:(id:string)=>void}) {
 const {can}=usePermissions(),{modal}=App.useApp(),[form]=Form.useForm()
 const [ids,setIds]=useState<string[]>(item?.permissions.map(p=>p.id)??[]),[memberId,setMemberId]=useState<string>()
 const name=Form.useWatch('name',form)??item?.name??''
 const nameChanged=!!item&&name!==item.name
 const permissionsChanged=!!item&&(ids.length!==item.permissions.length||ids.some(id=>!item.permissions.some(p=>p.id===id)))
 const allCatalog=[...catalog,...(item?.permissions??[]).filter(p=>!catalog.some(c=>c.id===p.id))]
 const editable=item?(can(`${kind}.manage`)||can(`${kind}.permissions.manage`)):can(`${kind}.manage`)
 const save=async(values:{name:string})=>{
  const data:Record<string,unknown>=item?{version:item.version}: {name:values.name}
  if(item&&nameChanged&&can(`${kind}.manage`))data.name=values.name
  if(can(`${kind}.permissions.manage`)&&(!item||permissionsChanged))data.permission_ids=ids
  const commit=async()=>{await run(item?'patch':'post',`/${kind}${item?'/'+item.id:''}`,data);close()}
  if(item&&permissionsChanged&&item.member_count)modal.confirm({title:'Xác nhận thay đổi quyền?',content:`Ảnh hưởng ${item.member_count} tài khoản.`,onOk:commit})
  else await commit()
 }
 return <Modal title={`${kind==='groups'?'Nhóm quyền':'Vai trò'}${item?' · '+item.name:' mới'}`} open width={900} onCancel={()=>{if(!busy)close()}} closable={!busy} maskClosable={!busy} destroyOnHidden footer={editable?<Button type="primary" loading={busy} disabled={!!item&&!nameChanged&&!permissionsChanged} onClick={()=>form.submit()}>Lưu</Button>:null}>
  {item&&<Typography.Paragraph>Mã: <Typography.Text strong>{item.code}</Typography.Text></Typography.Paragraph>}
  <Form form={form} layout="vertical" initialValues={{name:item?.name}} onFinish={save}>
   <Form.Item name="name" label="Tên" rules={[{required:true,whitespace:true,max:120}]}><Input disabled={!can(`${kind}.manage`)||busy} maxLength={120}/></Form.Item>
  </Form>
  <Typography.Title level={5}>Quyền</Typography.Title>
  {item?.system&&<Alert type="info" title="ADMIN luôn có toàn bộ quyền của hệ thống. Quyền mới được tự động bổ sung."/>}
  <PermissionMatrix catalog={allCatalog} value={ids} onChange={setIds} disabled={!!item?.system||!can(`${kind}.permissions.manage`)||busy}/>
  {item&&permissionsChanged&&<Alert style={{marginBlock:12}} type="warning" title={`Thay đổi ảnh hưởng ${item.member_count} tài khoản đang sử dụng.`} description={`Thêm ${ids.filter(id=>!item.permissions.some(p=>p.id===id)).length} quyền; gỡ ${item.permissions.filter(p=>!ids.includes(p.id)).length} quyền. Quyền từ nguồn khác vẫn giữ hiệu lực.`}/>}
  {item&&<>          <Typography.Title level={5}>Thành viên</Typography.Title>
          <Table
            rowKey="id"
            size="small"
            dataSource={item.members}
            columns={[
              { title: 'Username', dataIndex: 'username' },
              {
                title: 'Trạng thái',
                render: (_, r) => (r.deleted_at ? 'Đã xóa mềm' : r.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa')
              },
              {
                title: 'Thao tác',
                render: (_, r) => (
                  <Button disabled={!!r.deleted_at} onClick={() => openAccount(r.id)}>
                    Mở tài khoản / chuyển nhóm
                  </Button>
                )
              }
            ]}
          />
          {kind === 'groups' && can('users.groups.manage') && (
            <Space wrap>
              <Select
                placeholder="Chọn tài khoản trên trang hiện tại"
                style={{ width: 300 }}
                value={memberId}
                onChange={setMemberId}
                options={accounts
                  .filter((a) => a.can_join_group && a.group?.id !== item.id)
                  .map((a) => ({ value: a.id, label: `${a.username} · ${a.group?.name ?? 'Chưa có nhóm'}` }))}
              />
              <Button
                disabled={!memberId}
                loading={busy}
                onClick={async () => {
                  const account = await getData<Account>('/users/' + memberId)
                  await run('put', `/users/${memberId}/group`, { group_id: item.id, version: account.version })
                  close()
                }}
              >
                Thêm / chuyển vào nhóm
              </Button>
            </Space>
          )}
</>}
 </Modal>
}
