import { Button, Input, InputNumber, Select } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

export type GoldScaleRow = { box: string; gross: string }
export type GoldAmountRow = { name: string; unit: string; count: string }
export type GoldOtherRow = { name: string; add: string; subtract: string }

export function numberOrNull(value?: string | null): number | null {
  if (value == null || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}
export function formatGold(value: number | null, suffix = ''): string {
  return value == null ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suffix
}
export function sumGold(values: Array<number | null>): number {
  return values.reduce<number>((sum, n) => sum + (n ?? 0), 0)
}
export function GoldInput({ value, onChange, placeholder = '', integer = false }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  integer?: boolean
}) {
  return <InputNumber<string> aria-label={integer ? 'Số lượng' : 'Trọng lượng'}
    className="gold-field" size="small" stringMode controls={false} min="0" precision={integer ? 0 : 2}
    value={value || null} placeholder={placeholder}
    formatter={(current, info) => info.userTyping ? info.input : current == null || current === '' ? '' : Number(current).toLocaleString('en-US', { minimumFractionDigits: integer ? 0 : 2, maximumFractionDigits: integer ? 0 : 2 })}
    parser={text => (text ?? '').replaceAll(',', '')}
    onChange={next => onChange(next ?? '')} />
}
function EntryBlock({ title, cols, headers, children, onAdd, footerLabel, totals }: {
  title: string
  cols: string
  headers: string[]
  children: React.ReactNode
  onAdd: () => void
  footerLabel: string
  totals: Array<string>
}) {
  return <section className="gold-entry-block">
    <div className="gold-entry-title">{title}</div>
    <div className="gold-grid-head" style={{ gridTemplateColumns: cols }}>{headers.map((head, i) => <span key={head} className={i ? 'gold-align-right' : ''}>{head}</span>)}</div>
    <div className="gold-grid-body">{children}</div>
    <button className="gold-add-row" type="button" onClick={onAdd}><PlusOutlined /> Thêm dòng</button>
    <div className="gold-grid-footer" style={{ gridTemplateColumns: cols }}>
      <strong>{footerLabel}</strong>{totals.map((text, i) => <strong className="gold-align-right" key={i}>{text}</strong>)}
    </div>
  </section>
}
const scaleColumns = 'minmax(0,1.7fr) minmax(0,1fr) minmax(0,1.05fr)'
const amountColumns = 'minmax(0,1.7fr) minmax(0,.75fr) minmax(0,1.3fr)'
const otherColumns = 'minmax(0,1.8fr) minmax(0,.92fr) minmax(0,.92fr)'
const BOXES = [
  { value: '455.00', label: 'Hộp 01 · 455.00g' },
  { value: '0.00', label: 'Không hộp · 0g' },
]
export function GoldScaleTable({ rows, onChange, onAdd }: {
  rows: GoldScaleRow[]
  onChange: (index: number, key: keyof GoldScaleRow, value: string) => void
  onAdd: () => void
}) {
  const total = sumGold(rows.map(row => row.gross === '' ? null : (numberOrNull(row.gross) ?? 0) - (numberOrNull(row.box) ?? 0)))
  return <EntryBlock title="Vàng cân hiện tại" cols={scaleColumns} headers={['HỘP', 'SỐ CÂN', 'VÀNG THỰC']} onAdd={onAdd} footerLabel="TỔNG CÂN" totals={['',formatGold(total)]}>
    {rows.map((row, i) => {
      const net = numberOrNull(row.gross) == null ? null : (numberOrNull(row.gross) ?? 0) - (numberOrNull(row.box) ?? 0)
      return <div className="gold-grid-row" style={{ gridTemplateColumns: scaleColumns }} key={i}>
        <Select aria-label="Hộp" size="small" className="gold-box-select" placeholder="Chọn hộp..." options={BOXES}
          value={row.box || undefined} onChange={v => onChange(i,'box',v)} />
        <GoldInput value={row.gross} onChange={v => onChange(i,'gross',v)} />
        <strong className="gold-align-right">{formatGold(net)}</strong>
      </div>
    })}
  </EntryBlock>
}
export function GoldBagsTable({ rows, onChange, onAdd, onCustom }: {
  rows: GoldAmountRow[]
  onChange: (index: number, key: keyof GoldAmountRow, value: string) => void
  onAdd: () => void
  onCustom: (index: number) => void
}) {
  const total = sumGold(rows.map(row => row.count === '' || row.unit === '' ? null : (numberOrNull(row.unit) ?? 0) * (numberOrNull(row.count) ?? 0)))
  return <EntryBlock title="Túi bóng / bao bóng" cols={amountColumns} headers={['TRỌNG LƯỢNG','SL','TỔNG']} onAdd={onAdd} footerLabel="TỔNG TÚI BÓNG" totals={['',formatGold(total)]}>
    {rows.map((row,i) => <div className="gold-grid-row" style={{ gridTemplateColumns: amountColumns }} key={i}>
      {i < 5 ? <span className="gold-weight-preset">{formatGold(numberOrNull(row.unit))}</span>
        : <Button className="gold-custom-choice" size="small" block onClick={() => onCustom(i)}>{row.unit ? row.name + ' · ' + row.unit + 'g' : 'Loại khác'}</Button>}
      <GoldInput value={row.count} onChange={v => onChange(i,'count',v)} integer />
      <strong className="gold-align-right">{row.count && row.unit ? formatGold((numberOrNull(row.unit) ?? 0) * (numberOrNull(row.count) ?? 0)) : '—'}</strong>
    </div>)}
  </EntryBlock>
}
export function GoldLabelsTable({ rows, onChange, onAdd }: {
  rows: GoldAmountRow[]
  onChange: (index: number, key: keyof GoldAmountRow, value: string) => void
  onAdd: () => void
}) {
  const total = sumGold(rows.map(row => row.count === '' || row.unit === '' ? null : (numberOrNull(row.unit) ?? 0) * (numberOrNull(row.count) ?? 0)))
  return <EntryBlock title="Nhãn đá / vật liệu phụ" cols={amountColumns} headers={['TRỌNG LƯỢNG','SL','TỔNG']} onAdd={onAdd} footerLabel="TỔNG NHÃN ĐÁ" totals={['',formatGold(total)]}>
    {rows.map((row,i) => <div className="gold-grid-row" style={{ gridTemplateColumns: amountColumns }} key={i}>
      <GoldInput value={row.unit} onChange={v => onChange(i,'unit',v)} />
      <GoldInput value={row.count} onChange={v => onChange(i,'count',v)} integer />
      <strong className="gold-align-right">{row.count && row.unit ? formatGold((numberOrNull(row.unit) ?? 0) * (numberOrNull(row.count) ?? 0)) : '—'}</strong>
    </div>)}
  </EntryBlock>
}
export function GoldOtherTable({ rows, onChange, onAdd }: {
  rows: GoldOtherRow[]
  onChange: (index: number, key: keyof GoldOtherRow, value: string) => void
  onAdd: () => void
}) {
  const plus = sumGold(rows.map(r => numberOrNull(r.add)))
  const minus = sumGold(rows.map(r => numberOrNull(r.subtract)))
  return <EntryBlock title="Các yếu tố khác" cols={otherColumns} headers={['NỘI DUNG','CỘNG','TRỪ']} onAdd={onAdd} footerLabel="TỔNG" totals={[formatGold(plus),formatGold(minus)]}>
    {rows.map((row,i) => <div className="gold-grid-row" style={{ gridTemplateColumns: otherColumns }} key={i}>
      <Input aria-label="Nội dung" size="small" placeholder="Nhập nội dung..." value={row.name} onChange={e => onChange(i,'name',e.target.value)} />
      <GoldInput value={row.add} onChange={v => onChange(i,'add',v)} />
      <GoldInput value={row.subtract} onChange={v => onChange(i,'subtract',v)} />
    </div>)}
  </EntryBlock>
}
