import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url))
backendRequire('dotenv').config({ path: fileURLToPath(new URL('../../backend/.env', import.meta.url)), quiet: true })
const base = process.env.SMOKE_API_URL || 'http://localhost:3001/api/v1'
const password = process.env.ADMIN_PASSWORD
assert.ok(password, 'ADMIN_PASSWORD required in backend environment; never printed')
const loginResponse = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) })
assert.ok(loginResponse.ok, 'Login failed: ' + loginResponse.status)
const token = (await loginResponse.json()).data.access_token
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  console.log(method, path, response.status)
  const data = response.status === 204 ? null : await response.json()
  return { ok: response.ok, status: response.status, ...data }
}
await request('/auth/me')
await request('/customers?page=1&page_size=10')
await request('/customer-ledger/summary?page=1&page_size=10')
await request('/employees?page=1&page_size=10')
if (process.argv.includes('--write')) {
  const code = 'QA-SMOKE-' + Date.now()
  const created = await request('/customers', 'POST', { name: 'Disposable API smoke test', status: 'ACTIVE' })
  assert.ok(created.ok, 'Create customer failed')
  const id = created.data.id
  const updated = await request('/customers/' + id, 'PATCH', { note: 'Smoke update' })
  if (updated.ok) {
    const entry = await request('/customer-ledger/customers/' + id + '/entries', 'POST', { business_date: '2026-10-12', occurred_at: '2026-10-12T10:00:00+07:00', transaction_type: 'RETURN_GOLD', gold_weight_g: '0.0000', note: 'Disposable zero-value smoke entry' })
    if (entry.ok) {
      await request('/customer-ledger/entries/' + entry.data.id)
      await request('/customer-ledger/entries/' + entry.data.id, 'PATCH', { note: 'Updated zero-value smoke entry' })
      await request('/customer-ledger/entries/' + entry.data.id + '/reverse', 'POST', { reason: 'Smoke test complete' })
      await request('/customer-ledger/customers/' + id + '?page=1&page_size=10')
    }
  }
  await request('/customers/' + id, 'DELETE')
  assert.ok(updated.ok, 'Update failed; inspect backend logs. Disposable customer code: ' + code)
}
