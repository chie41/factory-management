import { catalogPrice, catalogPriceCurrency } from '../features/catalog/api'
import { useState } from 'react'
import { OrderDesignSelect } from '../features/catalog/OrderDesignSelect'
import { CatalogImage } from '../features/catalog/CatalogImage'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography } from 'antd'
import { usePermissions } from '../features/auth/hooks/usePermissions'
import { RequestError } from '../components/common/RequestError'
import { PageFrame } from '../components/common/PageFrame'
import { LedgerCustomerSelect } from '../features/customer-ledger/components/LedgerCustomerSelect'
import { LedgerDecimalInput } from '../features/customer-ledger/components/LedgerDecimalInput'
import { currencyText, decimalPattern, weightText } from '../utils/decimal'
import {
  paymentLabels,
  workflowGet,
  workflowWrite,
  type Order
} from '../features/customer-ledger/services/workflowService'
import { errorText } from '../services/apiErrors'
export function OrdersPage() {
  const { can } = usePermissions(),
    cache = useQueryClient(),
    { message } = App.useApp(),
    [form] = Form.useForm()
  const [creating, setCreating] = useState(false),
    [customerId, setCustomerId] = useState<string>(),
    [splitting, setSplitting] = useState<Order>(),
    [quantities, setQuantities] = useState<Record<string, number>>({})
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => workflowGet<Order[]>('/orders') })
  const save = useMutation({
    mutationFn: ({ url, data, method = 'post' }: { url: string; data: object; method?: 'post' | 'patch' }) =>
      workflowWrite(url, data, method),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['orders'] })
      await cache.invalidateQueries({ queryKey: ['delivery-orders'] })
      setCreating(false)
      setSplitting(undefined)
      message.success('Đã lưu đơn hàng')
    },
    onError: (e) => message.error(errorText(e))
  })
  const ready = (order: Order) =>
    save.mutate({
      url: `/orders/${order.id}/status`,
      method: 'patch',
      data: { version: order.version, status: 'READY' }
    })
  const split = () => {
    if (!splitting) return
    const first = splitting.items
      .filter((i) => (quantities[i.id] ?? 0) > 0)
      .map((i) => ({ order_item_id: i.id, quantity: quantities[i.id] }))
    const second = splitting.items
      .filter((i) => i.quantity - (quantities[i.id] ?? 0) > 0)
      .map((i) => ({ order_item_id: i.id, quantity: i.quantity - (quantities[i.id] ?? 0) }))
    if (!first.length || !second.length) {
      message.error('Mỗi đơn nhỏ cần ít nhất một sản phẩm')
      return
    }
    save.mutate({
      url: `/orders/${splitting.id}/split`,
      data: { version: splitting.version, children: [{ items: first }, { items: second }] }
    })
  }
  return (
    <PageFrame
      title="Đơn hàng"
      subtitle="Đơn nguồn, dòng hàng và giá công BAHT dùng cho giao hàng"
      action={can('orders.create') ? 'Tạo đơn hàng' : undefined}
      onAction={() => {
        form.resetFields()
        setCustomerId(undefined)
        setCreating(true)
      }}
    >
      <RequestError error={orders.error} />
      <Table
        rowKey="id"
        dataSource={orders.data ?? []}
        loading={orders.isFetching}
        scroll={{ x: 850 }}
        columns={[
          { title: 'Mã đơn', dataIndex: 'order_code' },
          {
            title: 'Trạng thái',
            render: (_, o) => (
              <Tag color={o.delivery_error ? 'red' : undefined}>{o.delivery_error ? 'Đơn hàng sai' : o.status}</Tag>
            )
          },
          { title: 'Vàng', render: (_, o) => weightText(o.gold_weight_g) },
          { title: 'Tiền công gốc', render: (_, o) => currencyText(o.original_labor_baht, 'THB') },
          { title: 'Thanh toán', render: (_, o) => paymentLabels[o.labor_payment_status] },
          {
            title: 'Thao tác',
            render: (_, o) => (
              <Space>
                {o.status === 'PREPARING' && can('orders.update') && (
                  <Button onClick={() => ready(o)}>Sẵn sàng giao</Button>
                )}
                {['PREPARING', 'READY', 'AWAITING_DELIVERY_ASSIGNMENT'].includes(o.status) && can('orders.split') && (
                  <Button
                    onClick={() => {
                      setQuantities({})
                      setSplitting(o)
                    }}
                  >
                    Tách đơn
                  </Button>
                )}
              </Space>
            )
          }
        ]}
        expandable={{
          expandedRowRender: (o) => (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={o.items}
              columns={[
                {title:'Mẫu mã',render:(_,i)=><Space><CatalogImage value={i.design_image_snapshot}/>{i.design_code_snapshot??'—'}</Space>},
                { title: 'Dòng hàng', dataIndex: 'item_name' },
                { title: 'Số lượng', dataIndex: 'quantity' },
                { title: 'Trọng lượng / SP', render: (_, i) => weightText(i.unit_weight_g) },
                { title: 'Giá công / 15g', render: (_, i) => currencyText(i.labor_price_per_15g, 'THB') },
                { title: 'Tiền công dòng', render: (_, i) => currencyText(i.line_labor_amount, 'THB') }
              ]}
            />
          )
        }}
      />
      <Modal
        open={creating}
        title="Tạo đơn hàng nguồn"
        width={850}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        okText="Tạo đơn"
        cancelText="Hủy"
        destroyOnHidden
      >
        <RequestError error={save.error} />
        <Alert
          type="info"
          title="Giá công được chốt trên dòng đơn"
          description="Chọn mẫu để lấy trọng lượng và giá công BAHT đề xuất. Có thể chỉnh giá thực tế trên đơn; đổi danh mục sau này không thay đổi đơn đã tạo."
        />
        <Form
          form={form}
          layout="vertical"
          initialValues={{ items: [{ quantity: 1 }] }}
          onFinish={(values) => {
            if (!customerId) {
              message.error('Chọn khách hàng')
              return
            }
            save.mutate({ url: '/orders', data: { ...values, customer_id: customerId } })
          }}
        >
          <Form.Item label="Khách hàng" required>
            <LedgerCustomerSelect value={customerId} onChange={setCustomerId} />
          </Form.Item>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <div key={field.key} style={{ border: '1px solid #eee', padding: 12, marginBottom: 12 }}>
                    {can('design_models.read')&&<Form.Item name={[field.name,'design_model_id']} label="Mẫu mã"><OrderDesignSelect onPick={model=>{
                      if(!model)return
                      form.setFields([
                        {name:['items',field.name,'item_name'],value:model.name},
                        {name:['items',field.name,'unit_weight_g'],value:model.weight_g??undefined},
                        {name:['items',field.name,'labor_price_per_15g'],value:catalogPriceCurrency(model)==='THB'?catalogPrice(model)??undefined:undefined}
                      ])
                    }}/></Form.Item>}
                    <Form.Item
                      name={[field.name, 'item_name']}
                      label="Tên dòng sản phẩm"
                      rules={[{ required: true, whitespace: true, max: 180 }]}
                    >
                      <Input />
                    </Form.Item>
                    <Space align="start" wrap>
                      <Form.Item name={[field.name, 'quantity']} label="Số lượng" rules={[{ required: true }]}>
                        <InputNumber min={1} precision={0} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'unit_weight_g']}
                        label="Trọng lượng / SP (g)"
                        rules={[{ required: true, pattern: decimalPattern }]}
                      >
                        <LedgerDecimalInput />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'labor_price_per_15g']}
                        label="Giá công / 15g (B)"
                        rules={[{ required: true, pattern: decimalPattern }]}
                      >
                        <LedgerDecimalInput />
                      </Form.Item>
                      <Button danger disabled={fields.length === 1} onClick={() => remove(field.name)}>
                        Bỏ dòng
                      </Button>
                    </Space>
                  </div>
                ))}
                <Button onClick={() => add({ quantity: 1 })}>Thêm dòng</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
      <Modal
        open={!!splitting}
        title="Tách thành hai đơn độc lập"
        onCancel={() => setSplitting(undefined)}
        onOk={split}
        confirmLoading={save.isPending}
        okText="Tách đơn"
        cancelText="Hủy"
      >
        <Typography.Paragraph>
          Nhập số lượng chuyển vào đơn nhỏ thứ nhất. Phần còn lại sang đơn nhỏ thứ hai; giá công / trọng lượng của dòng
          gốc được giữ nguyên. Có thể tiếp tục tách các đơn nhỏ chưa giao.
        </Typography.Paragraph>
        {splitting?.items.map((i) => (
          <Form.Item label={`${i.item_name} · tổng ${i.quantity}`} key={i.id}>
            <InputNumber
              min={0}
              max={i.quantity}
              precision={0}
              value={quantities[i.id] ?? 0}
              onChange={(q) => setQuantities((v) => ({ ...v, [i.id]: q ?? 0 }))}
            />
          </Form.Item>
        ))}
      </Modal>
    </PageFrame>
  )
}
