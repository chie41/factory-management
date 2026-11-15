import { GoldDailyPreview } from '../../features/gold/GoldDailyPreview'
import { GoldSessionsPage } from '../../features/gold/GoldSessionsPage'
import { CatalogPage } from '../../pages/CatalogPage'
import { ProductionBatchesPage } from '../../pages/ProductionBatchesPage'
import { BatchCreatePage } from '../../features/production/BatchCreate'
import { ProductionBatchDetailPage } from '../../pages/ProductionBatchDetailPage'
import { OrdersPage } from '../../pages/OrdersPage'
import { DeliveriesPage } from '../../pages/DeliveriesPage'
import { CashPage } from '../../pages/CashPage'
import { usePermissions } from '../../features/auth/hooks/usePermissions'
import { PermissionRoute } from '../../features/auth/components/Permissions'
import { AccountsPage } from '../../pages/AccountsPage'
import { Navigate, Route, Routes } from 'react-router-dom'
import { EmployeesPage } from '../../pages/EmployeesPage'
import { CustomersPage } from '../../pages/CustomersPage'
import { LedgerPage } from '../../pages/LedgerPage'
export function PageRouter() {
  const { can } = usePermissions()
  const home = can('employees.read') ? '/employees' : can('customers.read') ? '/customers' : can('customer_ledger.read') ? '/ledger' : can('users.read') ? '/system/accounts' : can('orders.read') ? '/orders' : can('delivery.manage') ? '/deliveries' : can('cash.read') ? '/cash' : can('design_models.read') ? '/design-models' : can('components.read') ? '/components' : can('production.read') ? '/production-batches' : '/employees'
  return <Routes>
    <Route path="/gold" element={<PermissionRoute permission="production.read"><GoldSessionsPage /></PermissionRoute>} />
    <Route path="/gold/daily/:date" element={<PermissionRoute permission="production.read"><GoldDailyPreview /></PermissionRoute>} />
    <Route path="/production-batches/new" element={<PermissionRoute permission="production.create"><PermissionRoute permission="design_models.read"><BatchCreatePage /></PermissionRoute></PermissionRoute>} />
    <Route path="/production-batches" element={<PermissionRoute permission="production.read"><ProductionBatchesPage /></PermissionRoute>} />
    <Route path="/production-batches/:id" element={<PermissionRoute permission="production.read"><ProductionBatchDetailPage /></PermissionRoute>} />
    <Route path="/design-models" element={<PermissionRoute permission="design_models.read"><CatalogPage key="design-models" kind="design-models" /></PermissionRoute>} />
    <Route path="/components" element={<PermissionRoute permission="components.read"><CatalogPage key="components" kind="components" /></PermissionRoute>} />
    <Route path="/product-samples/*" element={<Navigate to="/design-models" replace />} />
    <Route path="/orders" element={<PermissionRoute permission="orders.read"><OrdersPage /></PermissionRoute>} />
    <Route path="/deliveries" element={<PermissionRoute permission="delivery.manage"><DeliveriesPage /></PermissionRoute>} />
    <Route path="/cash" element={<PermissionRoute permission="cash.read"><CashPage /></PermissionRoute>} />
    <Route path="/system/accounts" element={<PermissionRoute permission="users.read"><AccountsPage /></PermissionRoute>} />
    <Route path="/employees" element={<PermissionRoute permission="employees.read"><EmployeesPage /></PermissionRoute>} />
    <Route path="/employees/:employeeId" element={<PermissionRoute permission="employees.read"><EmployeesPage /></PermissionRoute>} />
    <Route path="/customers" element={<PermissionRoute permission="customers.read"><CustomersPage /></PermissionRoute>} />
    <Route path="/ledger" element={<PermissionRoute permission="customer_ledger.read"><LedgerPage /></PermissionRoute>} />
    <Route path="/ledger/:customerId" element={<PermissionRoute permission="customer_ledger.read"><LedgerPage /></PermissionRoute>} />
    <Route path="*" element={<Navigate to={home} replace />} />
  </Routes>
}




