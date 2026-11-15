import 'dotenv/config';
import assert from 'node:assert/strict';

// Read-only integration check against a running local backend; never prints tokens.
const base = process.env.LEDGER_CHECK_BASE_URL ?? 'http://localhost:3000/api/v1';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/v1$/.test(base)) throw new Error('This check only supports a local development server');
if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD must be configured locally');
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }) });
assert.ok([200, 201].includes(login.status), `Login failed (${login.status})`);
const { data: auth } = await login.json();
async function get(path) {
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${auth.access_token}` } });
  assert.equal(response.status, 200, path);
  return response.json();
}
const summary = await get('/customer-ledger/summary?page=1&page_size=1');
assert.ok(summary.statistics);
assert.ok(summary.meta.total >= summary.data.length);
const empty = await get('/customer-ledger/summary?q=__ledger_check_no_matching_customer__');
assert.equal(empty.meta.total, 0);
assert.equal(empty.statistics.customers_with_transactions, 0);
if (summary.data.length) {
  const id = summary.data[0].customer.id;
  const book = await get(`/customer-ledger/customers/${id}?group_by_day=true`);
  assert.equal(book.data.customer.id, id);
  assert.equal(book.data.totals.gold_debt_balance_g, summary.data[0].totals.gold_debt_balance_g);
  const filtered = await get(`/customer-ledger/customers/${id}?q=__ledger_check_no_matching_entry__&group_by_day=true`);
  assert.equal(filtered.data.entries.length, 0);
  assert.deepEqual(filtered.data.totals, book.data.totals);
  if (book.data.entries.length) {
    const entry = book.data.entries[0];
    const detail = await get(`/customer-ledger/entries/${entry.id}`);
    assert.equal(detail.data.customerId, id);
    assert.equal(detail.data.gold_debt_running_balance_g, entry.gold_debt_running_balance_g);
  }
}
console.log('PASS: real API authentication, summary/statistics, empty search, customer isolation, filtered balances and entry detail. No ledger writes.');
