import { LedgerExcelImport } from './LedgerExcelImport'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { App, Button, Form, Input, Modal, Space, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { LedgerEntry } from '../types/ledger'
import { RequestError } from '../../../components/common/RequestError'
import { weightText } from '../../../utils/decimal'
import { downloadCsv } from '../../../utils/exportCsv'
import { allLedgerEntries, createLedgerPdf, fetchLedgerEntry, fetchLedgerPrintBook, deleteLedgerEntry } from '../services/ledgerService'
import { LedgerEntryForm } from './LedgerEntryForm'
import { LedgerEntryDrawer } from './LedgerEntryDrawer'
import { LedgerDailyTable } from './LedgerDailyTable'
import { ledgerPrintMarkup } from './LedgerPrintReport'
import { LaborBalances } from './LaborBalances'
import { CustomerLedgerFilters } from './CustomerLedgerFilters'
import { ledgerTime } from '../utils/ledgerTime'
import { useLedger } from '../hooks/useLedger'
import { ledgerWorkspace } from '../hooks/ledgerWorkspace'

export function LedgerDetail({ customerId, active, add }: { customerId: string; active: boolean; add: () => void }) {
  const state = useLedger(customerId)
  const query = state.book
  const book = query.data?.data
  useEffect(() => { if (book) ledgerWorkspace.open({ id: customerId, name: book.customer.name, code: book.customer.customer_code }) }, [book, customerId])
  const [params, setParams] = useSearchParams()
  const selectedId = active ? params.get('entry') : null
  const [editing, setEditing] = useState<LedgerEntry | null>(null)
  const [reverseEntry, setReverseEntry] = useState<LedgerEntry | null>(null)
  const { can } = usePermissions()
  const [reasonForm] = Form.useForm<{ reason: string }>()
  const cache = useQueryClient()
  const { message } = App.useApp()
  const pdfUrl = useRef<string | null>(null)
  useEffect(() => () => { if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current) }, [])
  const printBook = useMutation({
    mutationFn: async ({ popup, filters }: { popup: Window; filters: typeof state.filters }) => {
      try {
        const completeBook = await fetchLedgerPrintBook(customerId, filters)
        const pdf = await createLedgerPdf(ledgerPrintMarkup(completeBook, filters))
        return { popup, pdf }
      } catch (error) { popup.close(); throw error }
    },
    onSuccess: ({ popup, pdf }) => {
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current)
      pdfUrl.current = URL.createObjectURL(pdf)
      if (!popup.closed) { popup.opener = null; popup.location.replace(pdfUrl.current) }
      else message.info('Cửa sổ xem PDF đã đóng. Bấm In để mở lại.')
    },
  })
  const openPrint = () => {
    // Open synchronously with the click, before the API calls, to avoid popup blocking.
    const popup = window.open('about:blank', '_blank')
    if (!popup) { message.warning('Cho phép mở cửa sổ mới để xem và in PDF.'); return }
    popup.document.title = 'Sổ giao dịch — Đang tạo PDF'
    popup.document.body.textContent = 'Đang tạo PDF sổ giao dịch…'
    printBook.mutate({ popup, filters: { ...state.filters } })
  }
  const detail = useQuery({ queryKey: ['ledger-entry', customerId, selectedId], queryFn: async () => {
    const row = await fetchLedgerEntry(selectedId!)
    if (row.customerId && row.customerId !== customerId) throw new Error('Giao dịch không thuộc khách hàng đang mở')
    return row
  }, enabled: !!selectedId })
  const inspect = (entry: LedgerEntry) => setParams({ entry: entry.id })
  const closeDetail = () => setParams({})
  const reverse = useMutation({ mutationFn: (reason: string) => deleteLedgerEntry(reverseEntry!.id, reason), onSuccess: async () => {
    closeDetail()
    await Promise.all([cache.invalidateQueries({ queryKey: ['ledger'] }), cache.invalidateQueries({ queryKey: ['ledger-entry'] })])
    setReverseEntry(null); message.success('Đã xóa vĩnh viễn giao dịch')
  } })
  const requestReverse = (entry: LedgerEntry) => { reverse.reset(); reasonForm.resetFields(); setReverseEntry(entry) }
  const exportBook = useMutation({ mutationFn: () => allLedgerEntries(customerId, state.filters), onSuccess: entries => {
    downloadCsv(`so-giao-dich-${book?.customer.customer_code ?? customerId}.csv`, [
      ['ID', 'Ngày', 'Loại', 'Vàng (g)', 'Biến động nợ vàng', 'Lũy kế nợ vàng', 'Tiền công phải trả', 'Tiền công đã trả', 'Tiền tệ', 'Số tiền (Swagger)', 'Reverse', 'Ghi chú'],
      ...entries.map(row => [row.id, row.businessDate, row.transactionType ?? row.entry_type, row.goldWeightG ?? row.gold_weight_grams, row.gold_debt_change_g, row.gold_debt_running_balance_g, row.laborAmountDue, row.laborAmountPaid, row.laborCurrency ?? row.currency, row.amount, row.reversedAt, row.note]),
    ]); message.success('Đã xuất toàn bộ giao dịch khớp bộ lọc')
  } })
  const entry = detail.data ? { ...book?.entries.find(row => row.id === selectedId), ...detail.data } : undefined
  return <div className="ledger-detail-v2">
    <RequestError error={query.error} retry={() => void query.refetch()} /><RequestError error={exportBook.error} /><RequestError error={printBook.error} />
    <div className="ledger-customer-header"><div><h1>{book?.customer.name ?? (query.isPending ? 'Đang tải khách hàng…' : 'Sổ khách hàng')} <small>{book?.customer.customer_code}</small></h1><p>{[book?.customer.phone, book?.customer.address].filter(Boolean).join(' · ') || '—'}</p></div><Space wrap><LedgerExcelImport customerId={customerId} />{can('customer_ledger.create') && <Button type="primary" icon={<PlusOutlined />} onClick={add}>Thêm giao dịch</Button>}<Button loading={exportBook.isPending} onClick={() => exportBook.mutate()}>Xuất sổ</Button><Tooltip title="In / lưu PDF toàn bộ giao dịch khớp bộ lọc"><Button loading={printBook.isPending} disabled={!book} onClick={openPrint}>In</Button></Tooltip></Space></div>
    <div className="ledger-balance-cards"><div className="ledger-balance-card gold"><label>NỢ VÀNG (GỒM CHỜ DUYỆT)</label><strong>{weightText(book?.totals.gold_debt_balance_g)}</strong><small>Chờ duyệt: {weightText(book?.totals.gold_debt_pending_g)} · Đã duyệt/ghi sổ: {weightText(book?.totals.gold_debt_approved_g)} · Dữ liệu cũ: {weightText(book?.totals.gold_debt_legacy_g)}</small></div><div className="ledger-balance-card labor"><label>NỢ TIỀN CÔNG</label><LaborBalances totals={book?.totals} /></div><div className="ledger-balance-card"><label>Đơn đang xử lý</label><Tooltip title="Backend chưa có dữ liệu đơn hàng liên quan"><strong>{book?.pending_orders ?? '—'}</strong></Tooltip></div><div className="ledger-balance-card"><label>Giao dịch gần nhất</label><strong>{ledgerTime(book?.latest_transaction_at)}</strong></div></div>
    <CustomerLedgerFilters detail value={state.filters} change={state.setFilters} reset={state.resetFilters} />
    <LedgerDailyTable book={book} loading={query.isFetching} meta={query.data?.meta} page={state.page} pageSize={state.pageSize} onPage={state.setPage} inspect={inspect} edit={setEditing} reverse={requestReverse} />
    <LedgerEntryDrawer open={!!selectedId} entry={entry} book={book} loading={detail.isPending} error={detail.error} retry={() => void detail.refetch()} close={closeDetail} edit={() => { if (entry) { setEditing(entry); closeDetail() } }} reverse={() => entry && requestReverse(entry)} />
    <Modal rootClassName="ledger-modal" forceRender title="XÓA GIAO DỊCH" open={active && !!reverseEntry && can('customer_ledger.reverse')} onCancel={() => !reverse.isPending && setReverseEntry(null)} onOk={() => reasonForm.submit()} confirmLoading={reverse.isPending} okText="Xác nhận xóa" cancelText="Hủy">
      <p>Giao dịch sẽ bị xóa vĩnh viễn khỏi sổ. Số dư được tính lại sau khi xóa.</p><RequestError error={reverse.error} />
      <Form form={reasonForm} layout="vertical" onFinish={values => reverse.mutate(values.reason)}><Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: 'Nhập lý do xóa' }, { max: 500 }]}><Input.TextArea maxLength={500} rows={3} disabled={reverse.isPending} /></Form.Item></Form>
    </Modal>
    {editing && can('customer_ledger.update') && <LedgerEntryForm key={editing.id} customerId={customerId} entry={editing} open={active} close={() => setEditing(null)} />}
  </div>
}


