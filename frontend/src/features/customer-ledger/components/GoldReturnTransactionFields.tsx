import type { ReactNode } from 'react'
import { Form, Input, Tooltip } from 'antd'

// Extracted from the existing gold-return form, shared by create and edit.
export function GoldReturnTransactionFields({ customerField, dateField, weightField, recipientField, transactionField, fixedCustomer, editing, showType }: { customerField: ReactNode; dateField: ReactNode; weightField: ReactNode; recipientField: ReactNode; transactionField: ReactNode; fixedCustomer: boolean; editing: boolean; showType: boolean }) {
  return <>
    {fixedCustomer && customerField}
    {showType && transactionField}
    <div className="ledger-field-grid">{dateField}{fixedCustomer ? recipientField : weightField}</div>
    {!fixedCustomer && recipientField}
    {fixedCustomer && (editing ? <div className="ledger-field-grid"><Form.Item label="LOẠI VÀNG"><Tooltip title="Backend chưa có trường loại vàng"><Input disabled placeholder="Chưa có dữ liệu" /></Tooltip></Form.Item>{weightField}</div> : weightField)}
  </>
}
