import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, Modal, Select, Space } from 'antd'
import { isAxiosError } from 'axios'
import { documentedContract } from '../../../services/apiContract'
import { RequestError } from '../../../components/common/RequestError'
import { errorText } from '../../../services/apiErrors'
import { fetchDuplicateCustomerNames, saveCustomer } from '../services/customersService'
import type { Customer, CustomerInput } from '../types/customer'

type DuplicateConflict = { code: 'CUSTOMER_NAME_DUPLICATE'; duplicates: Customer[]; confirmation_token: string }
function conflict(error: unknown): DuplicateConflict | undefined {
  if (isAxiosError<DuplicateConflict>(error) && error.response?.status === 409 && error.response.data.code === 'CUSTOMER_NAME_DUPLICATE') return error.response.data
}
const normalizedName = (value?: string) => (value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi-VN')

export function CustomerForm({ customer, close, inspect }: { customer?: Customer; close: () => void; inspect?: (id: string) => void }) {
  const [form] = Form.useForm<CustomerInput>()
  const cache = useQueryClient()
  const { message, modal } = App.useApp()
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const name = normalizedName(Form.useWatch('name', form))
  const [debouncedName, setDebouncedName] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedName(name), 400)
    return () => window.clearTimeout(timer)
  }, [name])
  const duplicates = useQuery({
    queryKey: ['customer-duplicate-names', debouncedName, customer?.id],
    queryFn: () => fetchDuplicateCustomerNames(debouncedName, customer?.id),
    enabled: !!name && name === debouncedName,
    staleTime: 0,
  })
  const matching = name && name === debouncedName ? duplicates.data ?? [] : []
  const checking = !!name && (name !== debouncedName || duplicates.isFetching)
  const lookupError = name && name === debouncedName ? duplicates.error : undefined
  const customerList = (rows: Customer[], clickable = true) => <div style={{ maxHeight: 200, overflowY: 'auto' }}>{rows.map(row => <div key={row.id}>
    {inspect && clickable ? <Button type="link" style={{ padding: 0, height: 'auto', color: 'inherit', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => inspect(row.id)}>{row.name} – {row.customerCode ?? row.code}</Button> : <strong>{row.name} ({row.customerCode ?? row.code})</strong>}
    {row.phone ? ` – ${row.phone}` : ''} – {row.status === 'ACTIVE' ? 'Đang hoạt động' : row.status === 'INACTIVE' ? 'Ngừng hoạt động' : row.status ?? 'Chưa có trạng thái'}
  </div>)}</div>
  const save = useMutation({ mutationFn: ({ values, confirmation }: { values: CustomerInput; confirmation?: string }) => saveCustomer(values, customer?.id, confirmation), onSuccess: response => {
    for (const queryKey of [['customers'], ['customer'], ['ledger'], ['customer-duplicate-names']]) void cache.invalidateQueries({ queryKey })
    message.success(customer ? 'Đã lưu khách hàng' : `Đã tạo khách hàng ${response.data.data.customerCode ?? response.data.data.code}`); close()
  } })
  const submit = async (values: CustomerInput) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    let confirmation: string | undefined
    try {
      for (;;) {
        try { await save.mutateAsync({ values, confirmation }); return }
        catch (error) {
          const duplicate = conflict(error)
          if (!duplicate) return
          const confirmed = await modal.confirm({
            title: 'Khách hàng đã tồn tại',
            content: <Space orientation="vertical" style={{ width: '100%' }}><p>Hệ thống đã có khách hàng cùng tên:</p>{customerList(duplicate.duplicates, false)}<p>Bạn có chắc chắn muốn {customer ? 'lưu khách hàng với tên trùng' : 'tạo thêm một khách hàng có cùng tên'} không?</p></Space>,
            okText: customer ? 'Vẫn lưu khách hàng' : 'Vẫn tạo khách hàng',
            cancelText: 'Quay lại kiểm tra',
            autoFocusButton: 'cancel',
            maskClosable: false,
          })
          if (!confirmed) { save.reset(); return }
          // Retry the exact submitted values. Any concurrent change makes the
          // server issue a fresh warning/token, rather than bypassing it.
          confirmation = duplicate.confirmation_token
        }
      }
    } finally { submitting.current = false; setBusy(false) }
  }
  return <Modal open title={customer ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng'} width={560} onCancel={() => !busy && close()} onOk={() => form.submit()} confirmLoading={busy} closable={!busy} maskClosable={!busy} okText="Lưu khách hàng" cancelText="Hủy" cancelButtonProps={{ disabled: busy }}>
    <RequestError error={conflict(save.error) ? undefined : save.error} />
    <Form form={form} layout="vertical" disabled={busy} onFinish={values => void submit(values)} initialValues={{
      name: customer?.name, phone: customer?.phone ?? undefined,
      address: customer?.address ?? undefined, note: customer?.note ?? undefined, status: customer?.status as CustomerInput['status'] ?? 'ACTIVE',
    }}>
      <div className="form-grid"><>{customer && <Form.Item label="Mã khách hàng"><Input value={customer.customerCode ?? customer.code} readOnly /></Form.Item>}</>
      <Form.Item name="name" label="Tên khách hàng" rules={[{ required: true, whitespace: true, message: 'Nhập tên khách hàng' }, { max: 180 }]} extra={<>
        {checking && <span>Đang kiểm tra tên khách hàng…</span>}
        {!checking && lookupError && <Alert type="warning" showIcon title="Không thể kiểm tra tên trùng. Chưa xác định tên này đã tồn tại hay chưa." description={<>{errorText(lookupError)} <Button type="link" onClick={() => void duplicates.refetch()}>Thử lại</Button></>} />}
        {!checking && !lookupError && matching.length > 0 && <Alert type="warning" showIcon title="Cảnh báo: Tên khách hàng này đã tồn tại trong hệ thống. Vui lòng kiểm tra trước khi tạo mới." description={<><strong>Khách hàng trùng tên:</strong>{customerList(matching)}</>} />}
      </>}><Input maxLength={180} /></Form.Item></div>
      <Form.Item name="phone" label="Số điện thoại" rules={[{ max: 30 }]}><Input maxLength={30} /></Form.Item>
      <Form.Item name="address" label="Địa chỉ"><Input.TextArea rows={2} /></Form.Item>
      {!documentedContract && <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}><Select options={[{ value: 'ACTIVE', label: 'Đang hoạt động' }, { value: 'INACTIVE', label: 'Ngừng hoạt động' }]} /></Form.Item>}
      <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={3} /></Form.Item>
    </Form>
  </Modal>
}
