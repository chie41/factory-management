import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Form, Input, Modal, Select } from 'antd'
import type { Employee, EmployeeInput } from '../types/employee'
import { saveEmployee } from '../services/employeesService'
import { RequestError } from '../../../components/common/RequestError'
export function EmployeeForm({ employee, close }: { employee?: Employee; close: () => void }) {
  const [form] = Form.useForm<EmployeeInput>()
  const cache = useQueryClient()
  const { message } = App.useApp()
  const save = useMutation({ mutationFn: (values: EmployeeInput) => saveEmployee({ ...values, start_date: values.start_date || undefined }, employee?.id), onSuccess: response => {
    void cache.invalidateQueries({ queryKey: ['employees'] }); void cache.invalidateQueries({ queryKey: ['employee'] }); message.success(employee ? 'Đã lưu hồ sơ nhân viên' : `Đã tạo nhân viên ${response.data.data.code ?? response.data.data.employeeCode}`); close()
  } })
  return <Modal open title={employee ? 'Chỉnh sửa hồ sơ' : 'Thêm nhân viên'} width={560} onCancel={() => !save.isPending && close()} onOk={() => form.submit()} confirmLoading={save.isPending} okText="Lưu hồ sơ" cancelText="Hủy">
    <RequestError error={save.error} />
    <Form form={form} layout="vertical" onFinish={values => save.mutate(values)} disabled={save.isPending} initialValues={{
      name: employee?.name ?? employee?.fullName, phone: employee?.phone,
      role: employee?.role, status: employee?.status ?? 'ACTIVE', start_date: employee?.start_date ?? employee?.startDate?.slice(0, 10), note: employee?.note,
    }}>
      <div className="form-grid"><>{employee && <Form.Item label="Mã nhân viên"><Input value={employee.code ?? employee.employeeCode} readOnly /></Form.Item>}</>
      <Form.Item name="name" label="Họ tên" rules={[{ required: true, whitespace: true, message: 'Nhập họ tên' }]}><Input /></Form.Item></div>
      <div className="form-grid"><Form.Item name="phone" label="Số điện thoại"><Input /></Form.Item><Form.Item name="role" label="Vai trò"><Input placeholder="Ví dụ: Thợ" /></Form.Item></div>
      <div className="form-grid"><Form.Item name="start_date" label="Ngày vào làm"><Input type="date" /></Form.Item>
      <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}><Select options={[{ value: 'ACTIVE', label: 'Đang hoạt động' }, { value: 'INACTIVE', label: 'Ngừng hoạt động' }]} /></Form.Item></div>
      <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={3} /></Form.Item>
    </Form>
  </Modal>
}

