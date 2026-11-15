import { Button, Tabs } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { CustomerTab } from '../hooks/ledgerWorkspace'

export function CustomerLedgerTabs({ tabs, activeKey, select, close, search }: { tabs: CustomerTab[]; activeKey: string; select: (key: string) => void; close: (key: string) => void; search: () => void }) {
  return <div className="customer-ledger-tabs"><Tabs type="editable-card" hideAdd activeKey={activeKey} onChange={select} tabBarExtraContent={{ left: <button type="button" role="tab" aria-selected={activeKey === 'summary'} className="ledger-summary-tab" onClick={() => select('summary')}>Tổng hợp</button> }} onEdit={(key, action) => { if (action === 'remove') close(String(key)) }} items={[
    ...tabs.map(tab => ({ key: tab.id, label: <span title={tab.name}>{[tab.code, tab.name ?? 'Đang tải sổ…'].filter(Boolean).join(' · ')}</span>, closable: true })),
  ]} /><Button icon={<SearchOutlined />} onClick={search}>Tìm / mở sổ khách hàng</Button></div>
}
