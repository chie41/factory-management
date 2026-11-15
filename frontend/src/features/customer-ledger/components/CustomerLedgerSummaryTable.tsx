import { Button, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { TablePaginationConfig } from 'antd/es/table'
import type { LedgerSummary } from '../types/ledger'
import { DataTable } from '../../../components/common/DataTable'
import { Identity } from '../../../components/common/Identity'
import { LaborBalances } from './LaborBalances'
import { weightText } from '../../../utils/decimal'
import { ledgerTime } from '../utils/ledgerTime'

export function CustomerLedgerSummaryTable({ rows, loading, pagination, open }: { rows: LedgerSummary[]; loading: boolean; pagination: TablePaginationConfig; open: (row: LedgerSummary, entryId?: string) => void }) {
  const columns: ColumnsType<LedgerSummary> = [
    { title: 'STT', width: 60, dataIndex: 'display_order' },
    { title: 'KHÁCH HÀNG', minWidth: 186, width: '18%', render: (_, row) => <button className="ledger-identity-link" onClick={() => open(row)}><Identity name={row.customer.name} code={row.customer.customer_code} /></button> },
    { title: 'GIAO DỊCH GẦN NHẤT', width: '12%', render: (_, row) => ledgerTime(row.latest_transaction_at) },
    { title: 'NỢ VÀNG', width: '9%', render: (_, row) => <Tooltip title={`Gồm chờ duyệt ${weightText(row.totals.gold_debt_pending_g)}; đã duyệt/ghi sổ ${weightText(row.totals.gold_debt_approved_g)}; dữ liệu cũ ${weightText(row.totals.gold_debt_legacy_g)}. Tịnh vàng chính thức cũng tính phần chờ duyệt theo quy tắc đã chốt.`}><b className="gold-text">{weightText(row.totals.gold_debt_balance_g)}</b></Tooltip> },
    { title: 'NỢ TIỀN CÔNG', width: '12%', render: (_, row) => <LaborBalances totals={row.totals} /> },
    { title: 'ĐƠN ĐANG XỬ LÝ', width: '8%', render: (_, row) => row.pending_orders ?? <Tooltip title="Backend chưa có dữ liệu đơn hàng liên quan">—</Tooltip> },
    { title: 'GIAO HÀNG GẦN NHẤT', width: '11%', render: (_, row) => row.latest_delivery ? <Button type="link" onClick={() => open(row, row.latest_delivery!.entry_id)}>{new Date(row.latest_delivery.occurred_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}</Button> : '—' },
    { title: 'TRẠNG THÁI', width: '11%', render: (_, row) => <Tag color={row.has_gold_debt || row.has_labor_debt ? 'red' : row.customer.status === 'INACTIVE' ? 'default' : 'green'}>{row.has_gold_debt || row.has_labor_debt ? 'Có công nợ' : row.customer.status === 'INACTIVE' ? 'Ngừng hoạt động' : 'Đang hoạt động'}</Tag> },
    { title: 'HÀNH ĐỘNG', width: 112, render: (_, row) => <Button type="link" onClick={() => open(row)}>Mở sổ →</Button> },
  ]
  return <DataTable className="ledger-summary-table" tableLayout="fixed" scroll={{ x: 1014 }} columns={columns} dataSource={rows} loading={loading} rowKey={row => row.customer.id} pagination={pagination} />
}
