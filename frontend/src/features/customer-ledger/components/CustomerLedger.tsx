import { LedgerExcelImport } from './LedgerExcelImport'
import { DailyGoldReport } from './DailyGoldReport'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useState } from 'react'
import { Alert, Button, Modal, Segmented, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { CustomerPicker } from '../../customers/components/CustomerPicker'
import { CustomerLedgerTabs } from './CustomerLedgerTabs'
import { CustomerLedgerSummary } from './CustomerLedgerSummary'
import { LedgerDetail } from './LedgerDetail'
import { QuickTransactionsModal } from './QuickTransactionsModal'
import { useCustomerLedgerTabs } from '../hooks/useCustomerLedgerTabs'
import '../styles/customer-ledger.css'

export function CustomerLedger() {
  const { can } = usePermissions()
  const tabs = useCustomerLedgerTabs()
  const [summaryView, setSummaryView] = useState<string | number>('summary')
  const [picker, setPicker] = useState(false)
  const [createId, setCreateId] = useState<string | null>(null)
  return <section className="workspace-page compact customer-ledger-page">
    {!tabs.customerId && <div className="ledger-page-header"><div><h1>Sổ giao dịch khách hàng</h1><p>Theo dõi giao dịch và công nợ của từng khách hàng</p></div><Space wrap><LedgerExcelImport />{can('customer_ledger.create') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateId('summary')}>Thêm giao dịch</Button>}</Space></div>}
    <CustomerLedgerTabs tabs={tabs.tabs} activeKey={tabs.activeTabKey} select={tabs.select} close={tabs.closeCustomer} search={() => setPicker(true)} />
    {tabs.customerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tabs.customerId) && <Alert type="error" title="Đường dẫn sổ không hợp lệ" description="customerId phải là UUID của khách hàng." />}
    <div hidden={tabs.activeTabKey !== 'summary'}>
      <div className="ledger-summary-modes"><Segmented value={summaryView} onChange={setSummaryView} options={[{value:'summary',label:'Tổng hợp'},{value:'daily-gold',label:'Sổ vàng theo ngày'}]} /></div>
      <div hidden={summaryView !== 'daily-gold'}><DailyGoldReport active={tabs.activeTabKey === 'summary' && summaryView === 'daily-gold'} /></div>
      <div hidden={summaryView !== 'summary'}><CustomerLedgerSummary open={(row, entryId) => {
      tabs.openCustomer({ id: row.customer.id, name: row.customer.name, code: row.customer.customer_code }, entryId)
    }} /></div></div>
    {tabs.tabs.map(tab => <div key={tab.id} hidden={tabs.activeTabKey !== tab.id}><LedgerDetail customerId={tab.id} active={tabs.activeTabKey === tab.id} add={() => setCreateId(tab.id)} /></div>)}
    <Modal title="Tìm / mở sổ khách hàng" open={!!picker} footer={null} onCancel={() => setPicker(false)} destroyOnHidden width={560}>
      <CustomerPicker onSelect={id => { tabs.openCustomer({ id }); setPicker(false) }} />
    </Modal>
    {createId && can('customer_ledger.create') && <QuickTransactionsModal key={`create-${createId}`} customerId={createId === 'summary' ? undefined : createId} close={() => setCreateId(null)} />}
  </section>
}


