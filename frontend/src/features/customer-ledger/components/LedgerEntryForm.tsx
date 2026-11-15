import { ledgerLaborText, ledgerPaidText } from '../utils/ledgerLaborText'
import { LedgerDecimalInput } from './LedgerDecimalInput'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Drawer, Form, Input, InputNumber, Modal, Select, Tooltip } from 'antd'
import { documentedContract } from '../../../services/apiContract'
import { RequestError } from '../../../components/common/RequestError'
import { decimalPattern, weightText } from '../../../utils/decimal'
import { saveLedgerEntry } from '../services/ledgerService'
import { fetchCustomer } from '../../customers/services/customersService'
import { transactionLabels } from '../types/ledger'
import type { LedgerEntry, LedgerInput, LedgerWrite, TransactionType } from '../types/ledger'
import { markLedgerDraft } from '../hooks/ledgerDraftGuard'
import { LedgerCustomerSelect } from './LedgerCustomerSelect'
import { ledgerChanges } from '../utils/ledgerPayload'
import { DeliveryTransactionFields } from './DeliveryTransactionFields'
import { LedgerDateTimeInput } from './LedgerDateTimeInput'
import { GoldReturnTransactionFields } from './GoldReturnTransactionFields'

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23)
}
const decimalRule = { pattern: decimalPattern, message: 'Số không âm; tối đa 16 chữ số nguyên, 4 chữ số thập phân' }
export function LedgerEntryForm({
  customerId: initialCustomerId,
  entry,
  close,
  open = true,
  createType = 'RETURN_GOLD',
  embedded = false,
  onDirty,
  onPending,
  onReady,
  formId
}: {
  customerId?: string
  entry?: LedgerEntry
  close: () => void
  open?: boolean
  createType?: TransactionType
  embedded?: boolean
  onDirty?: (dirty: boolean) => void
  onPending?: (pending: boolean) => void
  onReady?: (ready: boolean) => void
  formId?: string
}) {
  const [form] = Form.useForm()
  const cache = useQueryClient()
  const { message, modal } = App.useApp()
  const draftKey = `ledger-draft:${initialCustomerId ?? 'summary'}:${entry?.id ?? `new-${createType}`}`
  const [draft, setDraft] = useState<Record<string, unknown> | undefined>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? 'null') ?? undefined
    } catch {
      return undefined
    }
  })
  const [dirty, setDirty] = useState(!!draft)
  const [customerId, setCustomerId] = useState(
    initialCustomerId ?? (typeof draft?.selected_customer_id === 'string' ? draft.selected_customer_id : undefined)
  )
  const [requestId] = useState<string>(() =>
    typeof draft?.request_id === 'string' ? draft.request_id : crypto.randomUUID()
  )
  const recovered = (entry?.transactionType ?? createType) === 'RETURN_RECOVERED_GOLD'
  const sourceBased = !!entry && ['DELIVERY', 'RETURN_GOODS'].includes(entry.transactionType ?? '')
  const delivery = (entry?.transactionType ?? createType) === 'DELIVERY'
  const [advanced, setAdvanced] = useState(delivery || (!!entry && entry.transactionType !== 'RETURN_GOLD'))
  const submitting = useRef(false)
  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => fetchCustomer(customerId!),
    enabled: !!customerId
  })
  const mutation = useMutation({
    mutationFn: async (values: LedgerWrite) => {
      const payload = ledgerChanges(values, entry)
      if (entry && !Object.keys(payload).length) return
      return saveLedgerEntry(customerId!, payload, entry?.id)
    },
    onSuccess: () => {
      try {
        sessionStorage.removeItem(draftKey)
      } catch {
        /* optional session persistence */
      }
      markLedgerDraft(draftKey, false)
      setDirty(false)
      void cache.invalidateQueries({ queryKey: ['ledger'] })
      void cache.invalidateQueries({ queryKey: ['ledger-entry'] })
      message.success(entry ? 'Đã cập nhật giao dịch' : 'Đã tạo giao dịch')
      close()
    }
  })
  useEffect(() => {
    onDirty?.(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    onPending?.(mutation.isPending)
  }, [mutation.isPending, onPending])
  useEffect(() => {
    onReady?.(!!customerId && !customer.isPending && !customer.error)
  }, [customerId, customer.isPending, customer.error, onReady])
  useEffect(() => {
    markLedgerDraft(draftKey, dirty)
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      markLedgerDraft(draftKey, false)
      window.removeEventListener('beforeunload', warn)
    }
  }, [dirty, draftKey])
  const initial = documentedContract
    ? {
        entry_type: entry?.entry_type ?? createType,
        amount: entry?.amount ?? 0,
        currency: entry?.currency ?? 'LAK',
        gold_weight_grams: entry?.gold_weight_grams ?? undefined,
        note: entry?.note ?? '',
        reference_type: entry?.referenceType ?? undefined,
        reference_id: entry?.referenceId ?? undefined
      }
    : {
        business_date: entry?.businessDate?.slice(0, 10) ?? localDateTime().slice(0, 10),
        local_time: localDateTime(entry?.occurredAt),
        actual_weight_g: entry?.actualWeightG ?? undefined,
        purity_percent: entry?.purityPercent ?? undefined,
        request_id: entry ? undefined : requestId,
        transaction_type: entry?.transactionType ?? createType,
        gold_weight_g: entry?.goldWeightG ?? '0',
        labor_amount_due: entry?.laborAmountDue ?? '0',
        labor_amount_paid: entry?.laborAmountPaid ?? '0',
        labor_currency: entry ? entry.laborCurrency?.trim() || undefined : 'THB',
        description: entry?.description ?? '',
        note: entry?.note ?? '',
        reference_type: entry?.referenceType ?? undefined,
        reference_id: entry?.referenceId ?? undefined
      }
  const submit = () => {
    if (submitting.current) return
    submitting.current = true
    const values = form.getFieldsValue(true)
    if (documentedContract) {
      const { entry_type, amount, currency, gold_weight_grams, reference_type, reference_id, note } = values
      mutation.mutate(
        { entry_type, amount, currency, gold_weight_grams, reference_type, reference_id, note },
        {
          onSettled: () => {
            submitting.current = false
          }
        }
      )
      return
    }
    const {
      transaction_type,
      gold_weight_g,
      actual_weight_g,
      purity_percent,
      labor_amount_due,
      labor_amount_paid,
      labor_currency,
      description,
      note,
      reference_type,
      reference_id
    } = values
    const unchangedTime = entry && values.local_time === localDateTime(entry.occurredAt)
    const business_date =
      unchangedTime ? values.business_date : String(values.local_time).slice(0, 10)
    mutation.mutate(
      {
        business_date,
        occurred_at: new Date(values.local_time).toISOString(),
        transaction_type,
        ...(recovered ? { actual_weight_g, purity_percent } : { gold_weight_g }),
        ...(entry ? {} : { request_id: requestId }),
        labor_amount_due,
        labor_amount_paid,
        labor_currency,
        description,
        note,
        reference_type,
        reference_id
      } as LedgerInput,
      {
        onSettled: () => {
          submitting.current = false
        }
      }
    )
  }
  const cancel = () => {
    if (mutation.isPending) return
    if (!dirty && !draft) {
      close()
      return
    }
    modal.confirm({
      title: 'Đóng biểu mẫu chưa lưu?',
      content: 'Bản nháp sẽ được giữ để tiếp tục khi mở lại giao dịch trong phiên này.',
      okText: 'Giữ nháp và đóng',
      cancelText: 'Tiếp tục chỉnh sửa',
      onOk: close
    })
  }
  const editGold = !!entry && entry.transactionType === 'RETURN_GOLD' && !advanced
  const recipientField = (
    <Form.Item label="NGƯỜI GHI NHẬN">
      <Input readOnly value={entry?.actor_name ?? 'Tài khoản đang đăng nhập (ghi nhận khi lưu)'} />
    </Form.Item>
  )
  const customerField = (
    <Form.Item label="KHÁCH HÀNG">
      <Input readOnly value={customer.data?.name ?? (customerId && customer.isPending ? 'Đang tải…' : customerId)} />
    </Form.Item>
  )
  const transactionField = (
    <Form.Item
      name={documentedContract ? 'entry_type' : 'transaction_type'}
      label="LOẠI GIAO DỊCH"
      rules={[{ required: true }]}
    >
      <Select
        disabled={!!entry || !advanced}
        options={(documentedContract
          ? ['DELIVERY', 'PAYMENT', 'RETURN_GOODS', 'RETURN_GOLD', 'ADJUSTMENT']
          : ['RETURN_GOLD', 'RETURN_GOODS', 'RETURN_RECOVERED_GOLD', 'DELIVERY', 'GOLD_RETURN_TO_CUSTOMER']
        ).map((value) => ({ value, label: transactionLabels[value] }))}
      />
    </Form.Item>
  )
  const dateField = (
    <Form.Item
      name="local_time"
      label={delivery ? 'NGÀY GIAO / GIỜ' : 'NGÀY / GIỜ'}
      rules={[
        { required: true, message: 'Chọn ngày giờ' },
        {
          validator: (_, value) =>
            value && Number.isNaN(new Date(value).getTime())
              ? Promise.reject(new Error('Ngày giờ không hợp lệ'))
              : Promise.resolve()
        }
      ]}
    >
      {sourceBased ? <Input readOnly value={localDateTime(entry?.occurredAt)} /> : <LedgerDateTimeInput />}
    </Form.Item>
  )
  const weightField = recovered ? (
    <Form.Item label="VÀNG CHUẨN QUY ĐỔI">
      <Input
        readOnly
        value={
          (entry?.goldWeightG ? weightText(entry.goldWeightG) : undefined) ??
          'Backend tính khi lưu: trọng lượng thực × tuổi vàng / 100'
        }
      />
    </Form.Item>
  ) : (
    <Form.Item
      name="gold_weight_g"
      label={
        editGold
          ? 'TRỌNG LƯỢNG KHÁCH TRẢ'
          : delivery
            ? 'TỔNG GIAO (+) / TRỌNG LƯỢNG (g)'
            : createType === 'GOLD_RETURN_TO_CUSTOMER' || entry?.transactionType === 'GOLD_RETURN_TO_CUSTOMER'
              ? 'TRỌNG LƯỢNG XƯỞNG TRẢ KHÁCH (g)'
              : 'TRỌNG LƯỢNG KHÁCH TRẢ (g)'
      }
      rules={[{ required: true, message: 'Nhập trọng lượng' }, decimalRule]}
    >
      <LedgerDecimalInput
        readOnly={sourceBased}
        suffix="g"
        title="Dấu chấm phân nhóm nghìn, dấu phẩy thập phân. Lưu tối đa 4 số lẻ."
      />
    </Form.Item>
  )
  const laborFields =
    entry && (entry.laborAmountDue !== '0.0000' || entry.laborAmountPaid !== '0.0000') ? (
      <Alert
        type="warning"
        title="Tiền công cũ — chỉ đọc, chờ đối soát"
        description={`Phải thu: ${ledgerLaborText(entry.laborAmountDue, entry.laborCurrency)} · Đã thu: ${ledgerPaidText(entry.laborAmountDue, entry.laborAmountPaid, entry.laborCurrency)}. Không sửa tổng tiền bằng tay; khoản thu mới cần nguồn đơn hàng và phê duyệt.`}
      />
    ) : null
  const fields = (
    <div className="ledger-form-content">
      <RequestError error={mutation.error} />
      <RequestError error={customer.error} retry={() => void customer.refetch()} />
      {draft && (
        <Alert
          type="info"
          title="Đã khôi phục bản nháp chưa lưu"
          action={
            <Button
              size="small"
              onClick={() => {
                try {
                  sessionStorage.removeItem(draftKey)
                } catch {
                  /* optional storage */
                }
                form.resetFields()
                form.setFieldsValue(initial)
                setDraft(undefined)
                setCustomerId(initialCustomerId)
                setDirty(false)
                markLedgerDraft(draftKey, false)
              }}
            >
              Bỏ nháp
            </Button>
          }
        />
      )}
      <Form
        id={formId}
        form={form}
        layout="vertical"
        disabled={mutation.isPending}
        onFinish={submit}
        initialValues={{ ...initial, ...draft }}
        onValuesChange={(_, values) => {
          setDirty(true)
          try {
            sessionStorage.setItem(
              draftKey,
              JSON.stringify({ ...form.getFieldsValue(true), ...values, selected_customer_id: customerId })
            )
          } catch {
            /* values stay in form */
          }
        }}
      >
        {!initialCustomerId && (
          <Form.Item label="KHÁCH HÀNG" required>
            <LedgerCustomerSelect
              value={customerId}
              onChange={(id) => {
                setCustomerId(id)
                setDirty(true)
                try {
                  sessionStorage.setItem(
                    draftKey,
                    JSON.stringify({ ...form.getFieldsValue(true), selected_customer_id: id })
                  )
                } catch {
                  /* optional storage */
                }
              }}
            />
          </Form.Item>
        )}
        {delivery && !documentedContract ? (
          <DeliveryTransactionFields
            entry={entry}
            customerField={
              initialCustomerId ? (
                customerField
              ) : (
                <Form.Item label="KHÁCH HÀNG">
                  <Input readOnly value={customer.data?.name} />
                </Form.Item>
              )
            }
            dateField={dateField}
            weightField={weightField}
            laborFields={laborFields}
          />
        ) : !advanced && !documentedContract ? (
          <GoldReturnTransactionFields
            customerField={customerField}
            dateField={dateField}
            weightField={weightField}
            recipientField={recipientField}
            transactionField={transactionField}
            fixedCustomer={!!initialCustomerId}
            editing={!!entry}
            showType={!embedded}
          />
        ) : (
          <>
            {editGold ? (
              customerField
            ) : (
              <div className="ledger-field-grid">
                {transactionField}
                {initialCustomerId ? customerField : recipientField}
              </div>
            )}
            {!documentedContract && (
              <>
                <div className="ledger-field-grid">
                  {dateField}
                  {initialCustomerId ? recipientField : weightField}
                </div>
                {initialCustomerId &&
                  (editGold ? (
                    <div className="ledger-field-grid">
                      <Form.Item label="LOẠI VÀNG">
                        <Tooltip title="Backend chưa có trường loại vàng">
                          <Input disabled placeholder="Chưa có dữ liệu" />
                        </Tooltip>
                      </Form.Item>
                      {weightField}
                    </div>
                  ) : (
                    weightField
                  ))}
              </>
            )}
            {advanced && !documentedContract && laborFields}
          </>
        )}
        {documentedContract && (
          <>
            <Form.Item name="amount" label="SỐ TIỀN" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="gold_weight_grams" label="TRỌNG LƯỢNG (g)">
              <InputNumber min={0} precision={4} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="currency" label="TIỀN TỆ">
              <Select options={['LAK', 'THB', 'VND'].map((value) => ({ value, label: value }))} />
            </Form.Item>
          </>
        )}
        {recovered && (
          <>
            <div className="ledger-field-grid">
              <Form.Item
                name="actual_weight_g"
                label="TRỌNG LƯỢNG THỰC TẾ (g)"
                rules={[{ required: true }, decimalRule]}
              >
                <LedgerDecimalInput suffix="g" />
              </Form.Item>
              <Form.Item name="purity_percent" label="TUỔI VÀNG (%)" rules={[{ required: true }, decimalRule]}>
                <LedgerDecimalInput suffix="%" />
              </Form.Item>
            </div>
            <Alert
              type="info"
              title="Vàng chuẩn của xưởng: 99,99%"
              description="Quy đổi = trọng lượng thực × tuổi vàng / 100. Backend lưu đầy đủ đầu vào và kết quả; không áp dụng hao hụt."
            />
          </>
        )}
        <Form.Item name="note" label="GHI CHÚ">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="CHỨNG TỪ (KHÔNG BẮT BUỘC)">
          <Tooltip title="Chưa có API upload/chứng từ, không gửi trường không được backend hỗ trợ">
            <Input disabled placeholder="Chưa có API chứng từ" />
          </Tooltip>
        </Form.Item>
        {entry && (
          <Alert
            type="info"
            title="TỰ ĐỘNG TÍNH LẠI SAU KHI LƯU"
            description="Số dư theo ngày và số dư hiện tại được tính lại bởi backend; giao dịch đã reverse không được sửa."
          />
        )}
        {!embedded && (
          <div className="ledger-form-actions">
            {entry && !delivery && (
              <Button type="link" onClick={() => setAdvanced(!advanced)}>
                {advanced ? 'Thu gọn' : 'Thông tin bổ sung / loại khác'}
              </Button>
            )}
            <Button onClick={cancel}>Hủy</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={mutation.isPending}
              disabled={!customerId || customer.isPending || !!customer.error}
            >
              {entry ? 'Lưu thay đổi' : 'Thêm giao dịch'}
            </Button>
          </div>
        )}
      </Form>
    </div>
  )
  const title = (
    <div>
      {entry
        ? entry.transactionType === 'RETURN_GOLD'
          ? 'CHỈNH SỬA TRẢ VÀNG'
          : entry.transactionType === 'DELIVERY'
            ? 'CHỈNH SỬA GIAO HÀNG'
            : 'CHỈNH SỬA GIAO DỊCH'
        : 'THÊM GIAO DỊCH'}
      <small>
        {entry
          ? (entry.referenceId ?? entry.id.slice(0, 8))
          : customerId
            ? `${transactionLabels[createType]} · ${customer.data?.name ?? ''}`
            : 'Chọn khách hàng trước khi ghi nhận giao dịch'}
      </small>
    </div>
  )
  if (embedded) return fields
  return entry ? (
    <Drawer
      rootClassName="ledger-drawer"
      title={title}
      open={open}
      onClose={cancel}
      styles={{ wrapper: { width: 'min(560px, 100vw)' } }}
    >
      {fields}
    </Drawer>
  ) : (
    <Modal
      centered
      rootClassName="ledger-modal"
      open={open}
      title={title}
      width={560}
      onCancel={cancel}
      footer={null}
      maskClosable={false}
    >
      {fields}
    </Modal>
  )
}
