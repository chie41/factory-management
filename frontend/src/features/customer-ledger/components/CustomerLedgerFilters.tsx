import type { ReactNode } from 'react'
import { currencyLabels } from '../../../utils/decimal'
import { Button, DatePicker, Input, Popover, Select } from 'antd'
import { CalendarOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { LedgerFilters } from '../types/ledger'
import { transactionLabels } from '../types/ledger'

export function CustomerLedgerFilters({ value, change, reset, detail = false, actions }: { value: LedgerFilters; change: (patch: Partial<LedgerFilters>) => void; reset: () => void; detail?: boolean; actions?: ReactNode }) {
  const period = value.from && value.to ? `${dayjs(value.from).format('DD/MM/YY')} – ${dayjs(value.to).format('DD/MM/YY')}` : 'Thời gian'
  const extras = [value.transaction_type, value.reversed && value.reversed !== 'all', value.currency, value.labor_status].filter(Boolean).length
  return <div className={`customer-ledger-filters ${detail ? 'detail-filters' : ''}`}>
    <Input prefix={<SearchOutlined />} aria-label={detail ? 'Tìm giao dịch' : 'Tìm kiếm khách hàng'} placeholder={detail ? 'Tìm tham chiếu / ghi chú' : 'Search khách hàng'} value={value.q} allowClear onChange={e => change({ q: e.target.value })} />
    <Popover trigger="click" placement="bottomLeft" content={<DatePicker.RangePicker aria-label="Khoảng thời gian" format="DD/MM/YYYY" value={value.from && value.to ? [dayjs(value.from), dayjs(value.to)] : null} onChange={dates => change({ from: dates?.[0]?.format('YYYY-MM-DD'), to: dates?.[1]?.format('YYYY-MM-DD') })} />}><Button icon={<CalendarOutlined />}>{period}</Button></Popover>
    {!detail && <><Select aria-label="Trạng thái khách hàng" placeholder="Trạng thái khách hàng" value={value.status} allowClear onChange={status => change({ status })} options={[{ value: 'ACTIVE', label: 'Đang hoạt động' }, { value: 'INACTIVE', label: 'Ngừng hoạt động' }]} />
    <Select aria-label="Công nợ" value={value.debt ?? 'any'} onChange={debt => change({ debt })} options={[{ value: 'any', label: 'Tất cả công nợ' }, { value: 'debt', label: 'Đang có công nợ' }, { value: 'gold', label: 'Nợ vàng' }, { value: 'labor', label: 'Nợ tiền công' }, { value: 'clear', label: 'Không có nợ' }]} />
    <Select aria-label="Phạm vi khách hàng" value={value.customer_scope ?? 'all'} onChange={customer_scope => change({ customer_scope })} options={[{ value: 'with_transactions', label: 'Khách có giao dịch' }, { value: 'all', label: 'Tất cả khách hàng' }, { value: 'without_transactions', label: 'Chưa có giao dịch' }]} /></>}
    <div className="ledger-filter-actions"><Popover trigger="click" placement="bottomRight" content={<div className="ledger-extra-filters">
      <label>Loại giao dịch<Select aria-label="Lọc loại giao dịch" allowClear value={value.transaction_type} placeholder="Tất cả" onChange={transaction_type => change({ transaction_type })} options={Object.entries(transactionLabels).filter(([key]) => !['PAYMENT', 'ADJUSTMENT'].includes(key)).map(([key, label]) => ({ value: key, label }))} /></label>
      <label>Hiệu lực<Select aria-label="Hiệu lực giao dịch" value={value.reversed ?? 'all'} onChange={reversed => change({ reversed })} options={[{ value: 'all', label: 'Tất cả' }, { value: 'active', label: 'Có hiệu lực' }, { value: 'reversed', label: 'Đã reverse' }]} /></label>
      <label>Tiền công<Select aria-label="Trạng thái tiền công" allowClear value={value.labor_status} placeholder="Tất cả" onChange={labor_status => change({ labor_status })} options={[{ value: 'PAID', label: 'Đã thu tiền công' }, { value: 'UNPAID', label: 'Chưa thu tiền công' }, { value: 'PARTIALLY_PAID', label: 'Thiếu tiền công' }]} /></label>
      <label>Tiền tệ<Select aria-label="Lọc tiền tệ" allowClear value={value.currency} placeholder="Tất cả" onChange={currency => change({ currency })} options={['THB','LAK','VND'].map(value => ({ value, label: currencyLabels[value] }))} /></label>
      <Button onClick={reset}>Đặt lại bộ lọc</Button>
    </div>}><Button icon={<PlusOutlined />}>Lọc thêm{extras ? ` (${extras})` : ''}</Button></Popover>{actions}</div>
  </div>
}
