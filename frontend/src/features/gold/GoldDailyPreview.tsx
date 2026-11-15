import { useMemo, useState } from 'react'
import { Button, Input, InputNumber, Modal, Select, Tag, Typography } from 'antd'
import { LeftOutlined, RightOutlined, PlusOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { fixedDecimalText } from '../../utils/decimal'
import './GoldDailyPreview.css'

type Work = { title: string; received: string; refined?: string }
type Worker = { id: string; name: string; jobs: Work[] }
type WeighRow = { box: string; gross: string }
type QuantityRow = { name: string; unit: string; count: string }
type OtherRow = { name: string; add: string; subtract: string }
type GoldDay = {
  workers: Worker[]
  weights: WeighRow[]
  bags: QuantityRow[]
  labels: QuantityRow[]
  others: OtherRow[]
  customerDebt: string
  previousClosed: string | null
}

const SLOTS = [
  ['nha', 'NHẠ'], ['phuong', 'PHƯƠNG'], ['son', 'SƠN'],
  ['duong', 'DƯƠNG'], ['thao', 'THẢO'], ['trang', 'TRANG'],
  ['dung', 'DŨNG'], ['lan', 'LAN'],
] as const

const EMPTY_WEIGHTS = () => Array.from({ length: 6 }, (): WeighRow => ({ box: '', gross: '' }))
const EMPTY_LABELS = () => Array.from({ length: 6 }, (): QuantityRow => ({ name: '', unit: '', count: '' }))
const EMPTY_OTHERS = () => Array.from({ length: 6 }, (): OtherRow => ({ name: '', add: '', subtract: '' }))
const INITIAL_BAGS: QuantityRow[] = [
  { name: 'Túi 1.20 g', unit: '1.20', count: '' }, { name: 'Túi 1.80 g', unit: '1.80', count: '' },
  { name: 'Túi 1.60 g', unit: '1.60', count: '' }, { name: 'Túi 2.20 g', unit: '2.20', count: '' },
  { name: 'Túi 0.90 g', unit: '0.90', count: '' },
]
const SAMPLE_JOBS: Partial<Record<(typeof SLOTS)[number][0], Work[]>> = {
  nha: [{ title: 'SX-0091 · Chuẩn bị', received: '200.00', refined: '199.80' }, { title: 'SX-0092 · Chuẩn bị', received: '100.00', refined: '99.90' }],
  phuong: [{ title: 'SX-0093 · Móc', received: '180.00', refined: '179.80' }],
  son: [{ title: 'SX-0094 · Hàn', received: '210.00', refined: '209.90' }],
  duong: [{ title: 'SX-0095 · Lắp ráp', received: '250.00', refined: '249.75' }],
  thao: [{ title: 'SX-0096 · Chuẩn bị', received: '150.00', refined: '149.85' }],
  trang: [{ title: 'SX-0097 · Móc', received: '200.00', refined: '200.10' }],
  lan: [{ title: 'SX-0098 · Hàn', received: '301.88' }],
}
function newDemoDay(day: string): GoldDay {
  const isExample = day === '2026-09-29'
  return {
    workers: SLOTS.map(([id, name]) => ({ id, name, jobs: isExample ? (SAMPLE_JOBS[id] ?? []) : [] })),
    weights: isExample ? [{ box: '455.00', gross: '1690.13' }, { box: '0.00', gross: '1177.95' }, { box: '0.00', gross: '1011.21' }, ...EMPTY_WEIGHTS().slice(3)] : EMPTY_WEIGHTS(),
    bags: INITIAL_BAGS.map(row => ({ ...row, count: isExample ? '2' : '' })),
    labels: EMPTY_LABELS(),
    others: EMPTY_OTHERS(),
    customerDebt: isExample ? '2450.00' : '0.00',
    previousClosed: isExample ? '9102.30' : null,
  }
}
function numberValue(text?: string | null) {
  if (!text || !/^(?:\d+)(?:\.\d+)?$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}
function format(value: number | null, suffix = '') {
  return value == null ? '—' : fixedDecimalText(value.toFixed(2), 2) + suffix
}
function total(rows: Array<number | null>) {
  return rows.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}
function DecimalField({ value, onChange, placeholder = '0.00' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <InputNumber<string> className="gold-number" stringMode min="0" controls={false} precision={2} placeholder={placeholder} value={value || null} onChange={next => onChange(next ?? '')} />
}
function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <section className="gold-section"><header className="gold-section-header"><strong>{title}</strong>{actions}</header>{children}</section>
}
function WorkerCard({ worker }: { worker: Worker }) {
  const received = total(worker.jobs.map(job => numberValue(job.received)))
  const refined = total(worker.jobs.map(job => numberValue(job.refined)))
  const complete = worker.jobs.length > 0 && worker.jobs.every(job => job.refined !== undefined)
  const difference = complete ? refined - received : null
  const outstanding = received - refined
  return <section className="gold-worker-card">
    <div className="gold-worker-title"><strong>{worker.name}</strong><span>{worker.jobs.length ? worker.jobs.length + ' công việc' : 'Không phát sinh'}</span></div>
    <table className="gold-worker-table"><thead><tr><th>CÔNG VIỆC</th><th>NHẬN</th><th>TỊNH</th></tr></thead>
      <tbody>{worker.jobs.length ? worker.jobs.map((job, index) => <tr key={index}><td title={job.title}>{job.title}</td><td>{format(numberValue(job.received))}</td><td>{format(numberValue(job.refined))}</td></tr>) : <tr><td colSpan={3} className="gold-empty-row">Chưa có công việc</td></tr>}</tbody>
      <tfoot><tr><th>TỔNG</th><td>{format(received)}</td><td>{complete || worker.jobs.length === 0 ? format(refined) : format(null)}</td></tr></tfoot>
    </table>
    <div className="gold-worker-footer"><span>Hao / Heo</span><strong className={difference != null && difference < 0 ? 'gold-negative' : ''}>{worker.jobs.length === 0 ? '0,00 g' : format(difference, ' g')}</strong></div><div className="gold-worker-footer gold-outstanding"><span>Còn giữ cuối ngày</span><strong className={outstanding < 0 ? 'gold-negative' : ''}>{format(outstanding, ' g')}</strong></div>
  </section>
}
export function GoldDailyPreview() {
  const [day, setDay] = useState('2026-09-29')
  const [data, setData] = useState<GoldDay>(() => newDemoDay('2026-09-29'))
  const [modal, setModal] = useState<'debt' | 'box' | 'material' | null>(null)
  const [selectedWeight, setSelectedWeight] = useState(0)
  const [material, setMaterial] = useState<QuantityRow>({ name: '', unit: '', count: '' })
  const [customerNotes, setCustomerNotes] = useState('Dữ liệu mẫu, chưa liên kết Sổ giao dịch khách hàng.')
  const setDate = (next: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return; setDay(next); setData(newDemoDay(next)) }
  const moveDate = (days: number) => { const date = new Date(day + 'T12:00:00'); date.setDate(date.getDate() + days); const next = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); setDate(next) }
  const updateWeight = (index: number, field: keyof WeighRow, value: string) => setData(prev => ({ ...prev, weights: prev.weights.map((item, i) => i === index ? { ...item, [field]: value } : item) }))
  const updateQuantity = (section: 'bags' | 'labels', index: number, field: keyof QuantityRow, value: string) => setData(prev => ({ ...prev, [section]: prev[section].map((item, i) => i === index ? { ...item, [field]: value } : item) }))
  const updateOther = (index: number, field: keyof OtherRow, value: string) => setData(prev => ({ ...prev, others: prev.others.map((item, i) => i === index ? { ...item, [field]: value } : item) }))
  // Each issued amount remains with the worker until physically returned, including across days.
  // Missing return data is not a confirmed zero return; it remains outstanding in the preview.
  const workerOutstanding = useMemo(() => total(data.workers.flatMap(worker => worker.jobs.map(job => (numberValue(job.received) ?? 0) - (numberValue(job.refined) ?? 0)))), [data.workers])
  const weighed = useMemo(() => total(data.weights.map(row => row.gross ? Math.max(0, (numberValue(row.gross) ?? 0) - (numberValue(row.box) ?? 0)) : null)), [data.weights])
  const bagTotal = useMemo(() => total(data.bags.map(row => row.count ? (numberValue(row.unit) ?? 0) * (numberValue(row.count) ?? 0) : null)), [data.bags])
  const labelTotal = useMemo(() => total(data.labels.map(row => row.count ? (numberValue(row.unit) ?? 0) * (numberValue(row.count) ?? 0) : null)), [data.labels])
  const othersPlus = useMemo(() => total(data.others.map(row => numberValue(row.add))), [data.others])
  const othersMinus = useMemo(() => total(data.others.map(row => numberValue(row.subtract))), [data.others])
  // Confirmed business formula. UI-only calculation until real gold sources are integrated.
  const finalGold = workerOutstanding + weighed + (numberValue(data.customerDebt) ?? 0) - bagTotal - labelTotal + othersPlus - othersMinus
  return <div className="gold-page">
    <div className="gold-page-heading"><div><Typography.Title level={3}>Tịnh vàng hằng ngày</Typography.Title><Typography.Text type="secondary">Sheet vận hành · Trọng lượng (g)</Typography.Text></div>
      <div className="gold-date-controls"><Button aria-label="Ngày trước" icon={<LeftOutlined />} onClick={() => moveDate(-1)} /><input className="gold-date-input" type="date" value={day} onChange={e => setDate(e.target.value)} aria-label="Ngày tịnh vàng" /><Button aria-label="Ngày sau" icon={<RightOutlined />} onClick={() => moveDate(1)} /><Tag color="blue">Bản xem trước</Tag></div></div>
    <div className="gold-preview-notice"><InfoCircleOutlined /> Giao diện mẫu từ Figma. Mọi dữ liệu đang hiển thị chỉ để xem trước; thay đổi không được lưu và không tác động đến công nợ, tồn vàng hoặc sản xuất.</div>
    <div className="gold-layout"><div className="gold-entry-scroll">
      <Section title="KHÁCH NỢ VÀNG" actions={<Button type="link" onClick={() => setModal('debt')}>Xem chi tiết ›</Button>}><div className="gold-debt-value">{format(numberValue(data.customerDebt), ' g')}</div></Section>
      <Section title="THỢ" actions={<div className="gold-issued"><small>VÀNG CÒN Ở THỢ</small><strong>{format(workerOutstanding, ' g')}</strong></div>}><div className="gold-worker-grid">{data.workers.map(worker => <WorkerCard key={worker.id} worker={worker} />)}</div></Section>
      <div className="gold-dual-grid"><Section title="VÀNG CÂN HIỆN TẠI">
        <table className="gold-entry-table"><thead><tr><th>HỘP</th><th>CÂN (g)</th><th>TỊNH (g)</th></tr></thead><tbody>{data.weights.map((row, i) => <tr key={i}><td><Button size="small" block onClick={() => { setSelectedWeight(i); setModal('box') }}>{row.box ? format(numberValue(row.box)) : 'Chọn hộp'}</Button></td><td><DecimalField value={row.gross} onChange={v => updateWeight(i, 'gross', v)} /></td><td className="gold-right">{row.gross ? format(Math.max(0, (numberValue(row.gross) ?? 0) - (numberValue(row.box) ?? 0))) : '—'}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>TỔNG</th><td className="gold-right">{format(weighed)}</td></tr></tfoot></table>
        {data.weights.length >= 6 && data.weights.every(r => r.gross !== '') && <Button type="link" icon={<PlusOutlined />} onClick={() => setData(p => ({ ...p, weights: [...p.weights, { box: '', gross: '' }] }))}>Thêm dòng</Button>}
      </Section><Section title="TÚI BÓNG / BAO BÓNG">
        <table className="gold-entry-table"><thead><tr><th>LOẠI</th><th>SL</th><th>TỔNG (g)</th></tr></thead><tbody>{data.bags.map((row, i) => <tr key={i}><td>{row.name}</td><td><DecimalField value={row.count} placeholder="0" onChange={v => updateQuantity('bags', i, 'count', v)} /></td><td className="gold-right">{row.count ? format((numberValue(row.unit) ?? 0) * (numberValue(row.count) ?? 0)) : '—'}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>TỔNG</th><td className="gold-right">{format(bagTotal)}</td></tr></tfoot></table>
        <Button type="link" icon={<PlusOutlined />} onClick={() => setModal('material')}>Thêm phụ liệu tùy chỉnh</Button>
      </Section></div>
      <div className="gold-dual-grid"><Section title="NHÃN ĐÁ / VẬT LIỆU PHỤ">
        <table className="gold-entry-table"><thead><tr><th>ĐƠN (g)</th><th>SL</th><th>TỔNG (g)</th></tr></thead><tbody>{data.labels.map((row, i) => <tr key={i}><td><DecimalField value={row.unit} onChange={v => updateQuantity('labels', i, 'unit', v)} /></td><td><DecimalField value={row.count} placeholder="0" onChange={v => updateQuantity('labels', i, 'count', v)} /></td><td className="gold-right">{row.unit && row.count ? format((numberValue(row.unit) ?? 0) * (numberValue(row.count) ?? 0)) : '—'}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>TỔNG</th><td className="gold-right">{format(labelTotal)}</td></tr></tfoot></table>
        {data.labels.length >= 6 && data.labels.every(r => r.unit && r.count) && <Button type="link" icon={<PlusOutlined />} onClick={() => setData(p => ({ ...p, labels: [...p.labels, { name: '', unit: '', count: '' }] }))}>Thêm dòng</Button>}
      </Section><Section title="YẾU TỐ KHÁC">
        <table className="gold-entry-table"><thead><tr><th>NỘI DUNG</th><th>CỘNG (g)</th><th>TRỪ (g)</th></tr></thead><tbody>{data.others.map((row, i) => <tr key={i}><td><Input size="small" value={row.name} onChange={e => updateOther(i, 'name', e.target.value)} /></td><td><DecimalField value={row.add} onChange={v => updateOther(i, 'add', v)} /></td><td><DecimalField value={row.subtract} onChange={v => updateOther(i, 'subtract', v)} /></td></tr>)}</tbody><tfoot><tr><th>TỔNG</th><td className="gold-right">{format(othersPlus)}</td><td className="gold-right">{format(othersMinus)}</td></tr></tfoot></table>
        {data.others.length >= 6 && data.others.every(r => r.name && (r.add || r.subtract)) && <Button type="link" icon={<PlusOutlined />} onClick={() => setData(p => ({ ...p, others: [...p.others, { name: '', add: '', subtract: '' }] }))}>Thêm dòng</Button>}
      </Section></div>
    </div><aside className="gold-summary">
      <h3>TỔNG KẾT NGÀY</h3>
      <div className="gold-summary-line"><span>Vàng còn ở thợ cuối ngày</span><strong>{format(issued, ' g')}</strong></div>
      <div className="gold-summary-line"><span>Vàng cân hiện tại</span><strong>{format(weighed, ' g')}</strong></div>
      <div className="gold-summary-line"><span>Khách nợ vàng</span><strong>{format(numberValue(data.customerDebt), ' g')}</strong></div>
      <div className="gold-summary-line"><span>Túi bóng</span><strong>{format(bagTotal, ' g')}</strong></div>
      <div className="gold-summary-line"><span>Nhãn đá</span><strong>{format(labelTotal, ' g')}</strong></div>
      <div className="gold-summary-line"><span>Yếu tố khác (+)</span><strong>{format(othersPlus, ' g')}</strong></div>
      <div className="gold-summary-line"><span>Yếu tố khác (−)</span><strong>{format(othersMinus, ' g')}</strong></div>
      <div className="gold-summary-divider" /><div className="gold-summary-line"><span>Lần trước đã chốt</span><strong>{format(numberValue(data.previousClosed), ' g')}</strong></div>
      <div className="gold-summary-result"><small>TỔNG VÀNG TỊNH ĐƯỢC</small><strong>{format(finalGold, ' g')}</strong><p>Vàng còn ở thợ cuối ngày + Cân hiện tại + Khách nợ vàng − Túi bóng − Nhãn đá + Khác cộng − Khác trừ. Chỉ là phép tính trên dữ liệu xem trước.</p></div>
      <Button type="primary" block disabled title="Chưa triển khai ghi dữ liệu và chốt phiên">Chốt phiên tịnh vàng</Button>
    </aside></div>
    <Modal open={modal === 'debt'} title="Khách nợ vàng" onCancel={() => setModal(null)} onOk={() => setModal(null)} okText="Đóng" cancelButtonProps={{ style: { display: 'none' } }}><p>Tổng nợ vàng minh họa: <strong>{format(numberValue(data.customerDebt), ' g')}</strong></p><Input.TextArea value={customerNotes} onChange={e => setCustomerNotes(e.target.value)} rows={3} aria-label="Ghi chú xem trước" /><Typography.Text type="secondary">Chưa có drill-through dữ liệu khách hàng thật.</Typography.Text></Modal>
    <Modal open={modal === 'box'} title="Chọn hộp" onCancel={() => setModal(null)} onOk={() => setModal(null)} okText="Đóng" cancelButtonProps={{ style: { display: 'none' } }}><Select style={{ width: '100%' }} value={data.weights[selectedWeight]?.box || '0.00'} options={[{ label: 'Không có hộp · 0.00 g', value: '0.00' }, { label: 'Hộp 01 · 455.00 g (mẫu)', value: '455.00' }]} onChange={v => updateWeight(selectedWeight, 'box', v)} /></Modal>
    <Modal open={modal === 'material'} title="Thêm phụ liệu tùy chỉnh" okText="Thêm dòng" okButtonProps={{ disabled: !material.name.trim() || !material.unit || !material.count }} onCancel={() => setModal(null)} onOk={() => { setData(prev => ({ ...prev, bags: [...prev.bags, material] })); setMaterial({ name: '', unit: '', count: '' }); setModal(null) }}>
      <div className="gold-modal-fields"><label>Loại / tên<Input value={material.name} onChange={e => setMaterial(prev => ({ ...prev, name: e.target.value }))} /></label><label>Trọng lượng đơn (g)<DecimalField value={material.unit} onChange={value => setMaterial(prev => ({ ...prev, unit: value }))} /></label><label>Số lượng<DecimalField value={material.count} placeholder="0" onChange={value => setMaterial(prev => ({ ...prev, count: value }))} /></label><label>Tổng trừ (g)<strong>{format(material.unit && material.count ? (numberValue(material.unit) ?? 0) * (numberValue(material.count) ?? 0) : null, ' g')}</strong></label></div>
    </Modal>
  </div>
}
