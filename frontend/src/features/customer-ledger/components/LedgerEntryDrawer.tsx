import { ledgerEntryLabor } from '../utils/ledgerLaborText'
import { LedgerWorkflowPanel } from './LedgerWorkflowPanel'
import { approvalLabels, paymentLabels } from '../services/workflowService'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { Button, Drawer, Space, Tooltip } from 'antd'
import type { LedgerBook, LedgerEntry } from '../types/ledger'
import { transactionLabels } from '../types/ledger'
import { weightText } from '../../../utils/decimal'
import { ledgerTime } from '../utils/ledgerTime'
import { RequestError } from '../../../components/common/RequestError'

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="ledger-read-field"><label>{label}</label><div>{value || '—'}</div></div>
}
export function LedgerEntryDrawer({ entry, book, open, loading, error, retry, close, edit, reverse }: { entry?: LedgerEntry; book?: LedgerBook; open: boolean; loading: boolean; error: unknown; retry: () => void; close: () => void; edit: () => void; reverse: () => void }) {
  const { can } = usePermissions()
  const labor = entry ? ledgerEntryLabor(entry) : { due: '—', paid: '—' }
  const goldReturn = (entry?.transactionType ?? entry?.entry_type) === 'RETURN_GOLD'
  return <Drawer rootClassName="ledger-drawer" title={<div>{goldReturn ? 'CHI TIẾT TRẢ VÀNG' : 'CHI TIẾT GIAO DỊCH'}<small>{entry?.reference_code ?? entry?.referenceId ?? entry?.id ?? ''} · {entry?.reversedAt ? 'Đã xóa' : approvalLabels[entry?.approvalStatus??'LEGACY']}</small></div>} open={open} onClose={close} styles={{ wrapper: { width: 'min(520px, 100vw)' } }} loading={loading}>
    <RequestError error={error} retry={retry} />
    {entry && <div className="ledger-drawer-content">
      <div className={`ledger-entry-highlight ${goldReturn ? 'is-return' : ''}`}><div><label>{goldReturn ? 'MÃ GIAO DỊCH' : 'MÃ THAM CHIẾU'}</label><strong>{entry.reference_code ?? entry.referenceId?.slice(0, 8) ?? entry.id.slice(0, 8)}</strong></div><div><label>{goldReturn ? 'KHÁCH TRẢ' : transactionLabels[entry.transactionType ?? entry.entry_type ?? '']}</label><strong>{weightText(entry.goldWeightG ?? entry.gold_weight_grams)}</strong></div></div>
      <div className="ledger-field-grid"><Field label="KHÁCH HÀNG" value={book?.customer.name} /><Field label="NGÀY / GIỜ" value={ledgerTime(entry.occurredAt)} /><Field label={goldReturn ? 'NGƯỜI NHẬN' : 'NGƯỜI GIAO DỊCH'} value={entry.actor_name} /><Field label="NGƯỜI NHẬP" value={entry.created_by_name} /><Field label="NGUỒN NGHIỆP VỤ" value={entry.referenceType} /></div>
      {goldReturn && <div className="ledger-balance-flow"><Field label="NỢ VÀNG TRƯỚC" value={weightText(entry.gold_debt_before_g)} /><Field label="BIẾN ĐỘNG NỢ VÀNG" value={weightText(entry.gold_debt_change_g)} /><Field label="NỢ VÀNG SAU" value={weightText(entry.gold_debt_running_balance_g)} /></div>}
      {!goldReturn && <><div className="ledger-field-grid"><Field label="LOẠI GIAO DỊCH" value={transactionLabels[entry.transactionType ?? entry.entry_type ?? '']} /><Field label="CẬP NHẬT LẦN CUỐI" value={ledgerTime(entry.updatedAt ?? entry.createdAt)} /><Field label="TIỀN CÔNG PHẢI TRẢ" value={labor.due} /><Field label="TIỀN CÔNG ĐÃ TRẢ" value={labor.paid} /></div><section><label>CHI TIẾT HÀNG</label>{entry.products?.length ? entry.products.map((product, i) => <div className="ledger-drawer-product" key={i}><b>{product.name}</b><span>{product.quantity} SP</span><span>{weightText(product.unit_weight_g)}</span><span>{weightText(product.total_weight_g)}</span></div>) : <p className="ledger-missing">Chưa có dữ liệu dòng hàng từ backend.</p>}</section></>}
      {entry.transactionType==='RETURN_RECOVERED_GOLD'&&<div className="ledger-field-grid"><Field label="TRỌNG LƯỢNG THỰC" value={weightText(entry.actualWeightG)}/><Field label="TUỔI VÀNG" value={entry.purityPercent?entry.purityPercent+'%':null}/><Field label="QUY ĐỔI CHÍNH XÁC (g)" value={weightText(entry.recoveredExactGoldG)}/></div>}
      {entry.laborPaymentStatus&&<Field label="THANH TOÁN TIỀN CÔNG" value={paymentLabels[entry.laborPaymentStatus]}/>}
      {['ORDER_DELIVERY','MANUAL_DELIVERY'].includes(entry.referenceType??'')&&<LedgerWorkflowPanel ledgerId={entry.id}/>}
      <Field label="THAM CHIẾU LIÊN QUAN" value={entry.referenceId} /><Field label="GHI CHÚ" value={entry.note} />
      <Tooltip title="Chưa có API upload/chứng từ"><div><Field label="CHỨNG TỪ" value="Chưa có dữ liệu" /></div></Tooltip>
      <section><label>LỊCH SỬ CẬP NHẬT</label><p>{entry.createdAt ? `Tạo: ${ledgerTime(entry.createdAt)}` : '—'}{entry.updatedAt && <><br />Cập nhật: {ledgerTime(entry.updatedAt)}</>}{entry.reversedAt && <><br />Đã xóa: {ledgerTime(entry.reversedAt)}</>}</p></section>
      <Space className="ledger-drawer-actions" wrap>{can('customer_ledger.reverse') && <Button danger disabled={(!!entry.referenceId && ['ORDER_DELIVERY','MANUAL_DELIVERY','GOODS_RETURN'].includes(entry.referenceType??''))} onClick={reverse}>Xóa giao dịch</Button>}{can('customer_ledger.update') && <Button type="primary" disabled={!!entry.reversedAt||['ORDER_DELIVERY','MANUAL_DELIVERY','GOODS_RETURN'].includes(entry.referenceType??'')} onClick={edit}>Chỉnh sửa</Button>}<Button onClick={close}>Đóng</Button></Space>
    </div>}
  </Drawer>
}


