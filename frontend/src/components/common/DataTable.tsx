import { Empty, Table } from 'antd'
import type { TableProps } from 'antd'
export function DataTable<T extends object>({ className, scroll, locale, rowSelection, ...props }: TableProps<T>) {
  // A numeric scroll width is a minimum: Ant Design keeps min-width: 100%
  // on the table, so flexible content columns absorb extra available space.
  const columnWidth = (columns: NonNullable<TableProps<T>['columns']>): number => columns.reduce((total, column) => {
    if ('children' in column) return total + columnWidth(column.children)
    return total + (typeof column.width === 'number' ? column.width : column.minWidth ?? 160)
  }, 0)
  const minimumWidth = columnWidth(props.columns ?? []) + (rowSelection ? Number(rowSelection.columnWidth) || 32 : 0)
  return <div className="data-table-wrapper">
    <Table<T> pagination={{ pageSize: 10, showSizeChanger: false }} size="middle" {...props}
      className={['data-table', className].filter(Boolean).join(' ')}
      rowSelection={rowSelection ? { columnWidth: 32, ...rowSelection } : undefined}
      scroll={{ x: minimumWidth || '100%', ...scroll }}
      locale={{ emptyText: <Empty description="Không có dữ liệu phù hợp" />, ...locale }} />
  </div>
}
