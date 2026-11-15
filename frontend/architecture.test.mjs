import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const sourceRoot = path.resolve('src')
test('ledger note-only edits preserve nullable fields, currency, numeric precision and business date', () => {
  const { ledgerChanges } = load('features/customer-ledger/utils/ledgerPayload.ts')
  const original = { businessDate: '2026-10-09', occurredAt: '2026-10-10T08:30:00Z', transactionType: 'RETURN_GOLD', goldWeightG: '5.2500', laborAmountDue: '0.0000', laborAmountPaid: '0.0000', laborCurrency: null, description: null, note: null }
  const values = { business_date: '2026-10-09', occurred_at: '2026-10-10T08:30:00.000Z', transaction_type: 'RETURN_GOLD', gold_weight_g: '5.25', labor_amount_due: '0', labor_amount_paid: '0', labor_currency: undefined, description: '', note: 'updated' }
  assert.deepEqual(Object.keys(ledgerChanges(values, original)), ['note'])
  assert.equal(ledgerChanges(values), values)
})
test('ledger tabs deduplicate, prepend new/reopened customers and preserve independent filters across refresh', () => {
  const saved = new Map()
  const sessionStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) }
  const workspace = () => load('features/customer-ledger/hooks/ledgerWorkspace.ts', { sessionStorage }).ledgerWorkspace
  const store = workspace()
  const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002'
  store.open({ id: a }); store.open({ id: b }); store.open({ id: a, name: 'A' })
  assert.deepEqual(Array.from(store.snapshot().tabs, tab => tab.id), [b, a])
  store.filters(a, { q: 'gold', transaction_type: 'RETURN_GOLD' }); store.page(a, 3, 20)
  store.filters(b, { q: 'delivery' })
  assert.equal(store.view(a).page, 3); assert.equal(store.view(b).filters.q, 'delivery')
  const restored = workspace()
  assert.equal(restored.view(a).filters.q, 'gold'); assert.equal(restored.view(a).page, 3)
  restored.close(a); restored.open({ id: a })
  assert.deepEqual(Array.from(restored.snapshot().tabs, tab => tab.id), [a, b])
  assert.equal(restored.view(a).page, 1)
  restored.open({ id: 'invalid' }); assert.equal(restored.snapshot().tabs.length, 2)
})
function load(relativePath, mocks = {}) {
  const filename = path.resolve(sourceRoot, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(js, {
    exports, Intl, Date, crypto, localStorage: mocks.localStorage, sessionStorage: mocks.sessionStorage, window: mocks.window,
    require(specifier) {
      if (specifier in mocks) return mocks[specifier]
      const dependency = path.resolve(path.dirname(filename), specifier) + '.ts'
      return load(path.relative(sourceRoot, dependency), mocks)
    },
  }, { filename })
  return exports
}

test('ledger warns before cancelling browser back with a dirty draft', () => {
  const listeners = new Map(), moves = []
  let prompts = 0
  const window = { history: { state: { idx: 3 }, go: delta => moves.push(delta) }, confirm: () => { prompts++; return false }, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) }
  const guard = load('features/customer-ledger/hooks/ledgerDraftGuard.ts', { window })
  const cleanup = guard.installLedgerHistoryGuard()
  guard.markLedgerDraft('draft-a', true)
  let stopped = false
  listeners.get('popstate')({ state: { idx: 2 }, stopImmediatePropagation: () => { stopped = true } })
  assert.equal(prompts, 1); assert.equal(stopped, true); assert.deepEqual(moves, [1])
  listeners.get('popstate')({ state: { idx: 3 }, stopImmediatePropagation() {} })
  guard.markLedgerDraft('draft-a', false)
  assert.equal(guard.confirmLedgerNavigation(), true)
  cleanup(); assert.equal(listeners.size, 0)
})

test('all relative imports resolve and source graph has no circular dependencies', () => {
  const files = fs.readdirSync(sourceRoot, { recursive: true }).filter(p => /\.(ts|tsx)$/.test(p)).map(p => path.join(sourceRoot, p))
  const graph = new Map()
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const imports = []
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue
      const specifier = node.moduleSpecifier?.text
      if (!specifier?.startsWith('.') || specifier.endsWith('.css')) continue
      // Vite resource queries (?raw, ?url) are not part of the filesystem path.
      const base = path.resolve(path.dirname(file), specifier.split('?')[0])
      const found = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(p => fs.existsSync(p) && fs.statSync(p).isFile())
      assert.ok(found, `${file}: missing ${specifier}`)
      imports.push(found)
    }
    graph.set(file, imports)
  }
  const visited = new Set()
  function visit(file, stack = []) {
    assert.ok(!stack.includes(file), `Circular dependency: ${[...stack, file].join(' -> ')}`)
    if (visited.has(file)) return
    for (const next of graph.get(file) ?? []) visit(next, [...stack, file])
    visited.add(file)
  }
  for (const file of files) visit(file)
})

test('list responses preserve array, items/data envelopes, totals and fallback', () => {
  const { listFrom } = load('utils/listFrom.ts')
  const rows = [{ id: '1' }]
  assert.equal(listFrom(rows, []).rows, rows)
  assert.equal(listFrom({ items: rows, total: 40 }, []).total, 40)
  assert.equal(listFrom({ data: rows, meta: { total: 30 } }, []).total, 30)
  assert.equal(listFrom({}, rows).rows, rows)
  assert.equal(listFrom({ items: [] }, rows).rows.length, 0)
})

test('auth accepts every existing token spelling and wrapped/unwrapped responses', async () => {
  for (const key of ['access_token', 'accessToken', 'token']) {
    for (const wrapped of [false, true]) {
      const payload = { [key]: 'test-token', user: { username: 'test' } }
      const apiClient = { post: async (url, values) => {
        assert.equal(url, '/auth/login'); assert.equal(values.username, 'test')
        return { data: wrapped ? { data: payload } : payload }
      }, get: async () => ({ data: wrapped ? { data: payload.user } : payload.user }) }
      const service = load('features/auth/services/authService.ts', { '../../../services/apiClient': { apiClient } })
      assert.equal((await service.login({ username: 'test', password: 'fixture' })).accessToken, 'test-token')
      assert.equal((await service.getCurrentUser()).username, 'test')
    }
  }
  const service = load('features/auth/services/authService.ts', { '../../../services/apiClient': { apiClient: { post: async () => ({ data: {} }) } } })
  await assert.rejects(service.login({}), /access token/)
})



test('services use page_size, real employee endpoint and never fall back on API failures', async () => {
  for (const [feature, service, method, endpoint] of [
    ['employees', 'employeesService', 'fetchEmployees', '/employees'],
    ['customers', 'customersService', 'fetchCustomers', '/customers'],
    ['customer-ledger', 'ledgerService', 'fetchLedgerSummary', '/customer-ledger/summary'],
  ]) {
    let fail = false
    const apiClient = { get: async (url, options) => {
      assert.equal(url, endpoint)
      assert.equal(JSON.stringify(options.params), JSON.stringify({ page: 1, page_size: 20 }))
      if (fail) throw new Error('offline')
      return { data: { data: [{ id: 'api-result' }], meta: { total: 1 } } }
    } }
    const module = load(`features/${feature}/services/${service}.ts`, { '../../../services/apiClient': { apiClient }, '../../../services/apiContract': { documentedContract: false } })
    assert.equal((await module[method]()).data[0].id, 'api-result')
    fail = true
    await assert.rejects(module[method](), /offline/)
  }
})

test('ledger preserves nested entries, balances and pagination, including empty books', async () => {
  const payload = { data: { customer: { id: 'c' }, totals: { gold_debt_balance_g: '-0.2500' }, entries: [] }, meta: { total: 0 } }
  const module = load('features/customer-ledger/services/ledgerService.ts', {
    '../../../services/apiClient': { apiClient: { get: async (url, options) => {
      assert.equal(url, '/customer-ledger/customers/c')
      assert.equal(options.params.page_size, 20)
      return { data: payload }
    } } }, '../../../services/apiContract': { documentedContract: false },
  })
  assert.equal((await module.fetchLedgerEntries('c')).data.totals.gold_debt_balance_g, '-0.2500')
  assert.equal((await module.fetchLedgerEntries('c')).data.entries.length, 0)
})

test('contract selection maps mutations explicitly without retrying another endpoint', async () => {
  for (const documentedContract of [false, true]) {
    const calls = []
    const apiClient = { post: async (...args) => calls.push(args), patch: async (...args) => calls.push(args), delete: async (...args) => calls.push(args) }
    const mocks = { '../../../services/apiClient': { apiClient }, '../../../services/apiContract': { documentedContract } }
    const customers = load('features/customers/services/customersService.ts', mocks)
    await customers.saveCustomer({ customer_code: 'KH1', name: 'Test', status: 'ACTIVE' })
    assert.equal(calls[0][0], '/customers')
    assert.equal('code' in calls[0][1], false)
    assert.equal('customer_code' in calls[0][1], false)
    assert.equal('status' in calls[0][1], !documentedContract)
    const ledger = load('features/customer-ledger/services/ledgerService.ts', mocks)
    const payload = documentedContract ? { entry_type: 'RETURN_GOLD', amount: 0 } : { transaction_type: 'RETURN_GOLD', gold_weight_g: '0.0001' }
    await ledger.saveLedgerEntry('c', payload)
    assert.equal(calls[1][0], documentedContract ? '/customers/c/ledger-entries' : '/customer-ledger/customers/c/entries')
    assert.equal(calls[1][1], payload)
    await ledger.deleteLedgerEntry('e', 'Wrong entry')
    assert.equal(calls[2][0], documentedContract ? '/customer-ledger-entries/e' : '/customer-ledger/entries/e')
    assert.equal(calls[2][1].data.reason, 'Wrong entry')
  }
})

test('numeric validation and display preserve precision and negative fractional balances', () => {
  const decimal = load('utils/decimal.ts')
  assert.equal(decimal.decimalUnits('9999999999999999.9999'), 99999999999999999999n)
  assert.equal(decimal.decimalUnits('0.0001'), 1n)
  assert.equal(decimal.decimalText('-0.2500'), '-0,2500')
  assert.equal(decimal.decimalText('9999999999999999.9999'), '9.999.999.999.999.999,9999')
  assert.equal(decimal.weightText('0.0000'), '0,00 g')
  assert.throws(() => decimal.decimalUnits('-1'))
  assert.throws(() => decimal.decimalUnits('1.00001'))
})


test('customer updates omit nullable optional fields incompatible with current backend', async () => {
  let body
  const module = load('features/customers/services/customersService.ts', {
    '../../../services/apiClient': { apiClient: { patch: async (_, payload) => { body = payload } } },
    '../../../services/apiContract': { documentedContract: false },
  })
  await module.saveCustomer({ customer_code: 'KH1', name: 'Test', status: 'ACTIVE', phone: null, address: null, note: 'Updated' }, 'c')
  assert.equal('phone' in body, false)
  assert.equal('address' in body, false)
  assert.equal(body.note, 'Updated')
})

test('employee creates and edits never forward client codes', async () => {
  const calls = []
  const module = load('features/employees/services/employeesService.ts', {
    '../../../services/apiClient': { apiClient: { post: async (...args) => calls.push(args), patch: async (...args) => calls.push(args) } },
  })
  const values = { code: 'CLIENT', employeeCode: 'CLIENT', employee_code: 'CLIENT', name: 'Test', status: 'ACTIVE' }
  await module.saveEmployee(values)
  await module.saveEmployee(values, 'employee-id')
  for (const [, payload] of calls) {
    assert.equal(payload.name, 'Test')
    assert.ok(!Object.keys(payload).some(key => /code/i.test(key)))
  }
})


test('quick entry draft inherits only common fields and keeps independent IDs', () => {
 const {blank}=load('features/customer-ledger/utils/quickEntryDraft.ts');
 const a=blank();a.type='DELIVERY';a.customer={id:'a'};a.employee={id:'e'};a.date='2026-08-01T10:00:00';a.note='private';a.received='500';a.hasReceipt=true;
 const b=blank(a);assert.notEqual(b.id,a.id);assert.notEqual(b.receiptId,a.receiptId);assert.equal(b.customer,a.customer);assert.equal(b.date,a.date);assert.equal(b.employee,a.employee);assert.equal(b.type,undefined);assert.equal(b.note,'');assert.equal(b.received,'');assert.equal(b.hasReceipt,false);assert.notEqual(b.lines[0].id,a.lines[0].id);
});
test('quick entry totals and payload preserve precision, dates and per-voucher types', () => {
 const {blank,totals,payload,iso}=load('features/customer-ledger/utils/quickEntryDraft.ts');
 const a=blank();Object.assign(a,{type:'DELIVERY',customer:{id:'customer'},employee:{id:'employee'},date:'2026-08-01T10:00:00',lines:[{id:'1',model:{id:'model'},quantity:'2',weight:'1,2345',price:'150'}],discountType:'PERCENT',discount:'10'});
 assert.equal(totals(a).net,222210n);assert.equal(totals(a).gold,24690n);
 assert.equal(payload(a).occurred_at,'2026-08-01T03:00:00.000Z');assert.equal(payload(a).items[0].unit_weight_g,'1.2345');assert.equal(iso('2026-08-01T10:00:00+07:00'),'2026-08-01T03:00:00.000Z');
 a.hasReceipt=true;a.received='10';a.collector={id:'collector'};a.receivedDate='2026-08-02T11:00:00';assert.equal(payload(a).receipt.received_at,'2026-08-02T04:00:00.000Z');assert.equal(payload(a).receipt.employee_id,'collector');
 a.type='RETURN_RECOVERED_GOLD';a.actual='1,2345';a.purity='96,5';assert.equal(payload(a).actual_weight_g,'1.2345');assert.equal(payload(a).receipt,undefined);assert.equal(payload(a).items,undefined);
 a.purity='100,0001';assert.throws(()=>payload(a));a.type='RETURN_GOODS';assert.throws(()=>payload(a));
});
test('quick entry requires actual employee, rejects fractional quantities and overpayment',()=>{
 const {blank,payload}=load('features/customer-ledger/utils/quickEntryDraft.ts');const a=blank();Object.assign(a,{type:'RETURN_GOLD',customer:{id:'c'},date:'2026-08-01T10:00:00',gold:'1'});assert.throws(()=>payload(a));a.employee={id:'e'};assert.equal(payload(a).gold_weight_g,'1');a.type='DELIVERY';a.lines=[{id:'l',model:{id:'m'},quantity:'1,5',weight:'1',price:'150'}];assert.throws(()=>payload(a));a.lines[0].quantity='1';a.hasReceipt=true;a.received='11';a.receivedDate=a.date;a.collector=a.employee;assert.throws(()=>payload(a));
});

test('ledger dates use application timezone at UTC day boundaries',()=>{
 const {applicationDate,applicationDateTime}=load('features/customer-ledger/utils/applicationDate.ts');
 assert.equal(applicationDate('2026-07-31T17:00:00Z'),'2026-08-01');
 assert.equal(applicationDateTime('2026-08-01T16:59:59Z'),'2026-08-01T23:59:59');
});

test('quick delivery ignores a fresh Enter placeholder but rejects partially entered rows',()=>{
 const {blank,payload,line}=load('features/customer-ledger/utils/quickEntryDraft.ts');const d=blank();Object.assign(d,{type:'DELIVERY',customer:{id:'c'},employee:{id:'e'},date:'2026-08-01T10:00:00',lines:[{id:'l',model:{id:'m'},quantity:'1',weight:'1',price:'150'},line()]});assert.equal(payload(d).items.length,1);d.lines[1].quantity='1';assert.throws(()=>payload(d));
});

function focusHarness(draft,options={}) {
 const {LedgerFocusManager,cellKey}=load('features/customer-ledger/utils/ledgerFocusManager.ts');
 const {quickFocusLayout}=load('features/customer-ledger/utils/quickFocusLayout.ts');
 const manager=new LedgerFocusManager();let focused;
 const refresh=()=>{const layout=quickFocusLayout(draft,{fixedCustomer:false,sourceOrders:false,canCollect:true,pending:false,...options});for(const cell of layout)manager.register(cell,{focus:()=>{focused=cell;manager.selected(cell);}});manager.layout(layout);return layout;};
 const layout=refresh();manager.focusTransaction(draft.id,false);
 return {manager,layout,refresh,current:()=>focused,key:cellKey};
}
test('focus manager opens at type and skips disabled/hidden/calculated fields',()=>{
 const {blank}=load('features/customer-ledger/utils/quickEntryDraft.ts');const d=blank();d.type='DELIVERY';const h=focusHarness(d,{fixedCustomer:true});assert.equal(h.current().fieldKey,'type');h.manager.next(h.current());assert.equal(h.current().fieldKey,'date');h.manager.next(h.current());assert.equal(h.current().fieldKey,'employee');h.manager.next(h.current());assert.equal(h.current().fieldKey,'model');assert.ok(!h.layout.some(c=>['total','laborTotal','received'].includes(c.fieldKey)));d.hasReceipt=true;h.refresh();assert.ok(h.manager.next(h.current()));assert.equal(h.current().fieldKey,'quantity');
});
test('focus requests wait for row registration, preserve UUIDs through deletion and survive rerenders',()=>{
 const {blank,line}=load('features/customer-ledger/utils/quickEntryDraft.ts');const d=blank();d.type='DELIVERY';const h=focusHarness(d);const first=h.layout.find(c=>c.section==='items'&&c.fieldKey==='quantity');h.manager.focus(first);const next=line();h.manager.configure({restore:()=>{},appendRow:()=>{d.lines.push(next);return {...first,rowId:next.id};}});h.manager.vertical(first,1);assert.equal(h.current().rowId,first.rowId);h.refresh();assert.equal(h.current().rowId,next.id);assert.equal(h.current().fieldKey,'quantity');const stable=h.key(h.current());h.refresh();assert.equal(h.key(h.current()),stable);h.manager.vertical(h.current(),-1);assert.equal(h.current().rowId,first.rowId);h.manager.deleted(first,[next.id]);d.lines.shift();h.refresh();assert.equal(h.current().rowId,next.id);assert.equal(h.current().fieldKey,'quantity');
});
test('20 sequential delivery rows navigate without DOM positions or timers',()=>{
 const {blank,line}=load('features/customer-ledger/utils/quickEntryDraft.ts');const d=blank();d.type='DELIVERY';const h=focusHarness(d);h.manager.configure({restore:()=>{},appendRow:c=>{const n=line();d.lines.push(n);return {...c,rowId:n.id};}});h.manager.focus(h.layout.find(c=>c.section==='items'));
 for(let i=0;i<20;i++){assert.equal(h.current().rowId,d.lines[i].id);for(const field of ['model','quantity','weight','price']){assert.equal(h.current().fieldKey,field);h.manager.next(h.current());h.refresh();}}
 assert.equal(d.lines.length,21);assert.equal(h.current().rowId,d.lines[20].id);assert.equal(h.current().fieldKey,'model');
});
test('navigation mode, edit mode, IME and remembered transaction focus stay independent',()=>{
 const {blank}=load('features/customer-ledger/utils/quickEntryDraft.ts');const d=blank();d.type='RETURN_GOLD';const h=focusHarness(d);h.manager.next(h.current());const cell=h.current();h.manager.beginEdit();assert.equal(h.manager.snapshot().mode,'edit');h.manager.cancelEdit();assert.equal(h.manager.snapshot().mode,'navigation');h.manager.compositionStart();assert.equal(h.manager.composing,true);assert.equal(h.manager.snapshot().mode,'edit');h.manager.compositionEnd();assert.equal(h.manager.composing,false);h.manager.focusTransaction(d.id);assert.equal(h.key(h.current()),h.key(cell));
});

test('arrow keys distinguish navigation/edit mode and defer to autocomplete and Vietnamese IME',()=>{
 const {blank}=load('features/customer-ledger/utils/quickEntryDraft.ts');const {handleCellKey}=load('features/customer-ledger/utils/ledgerKeyboardNavigation.ts');const d=blank();d.type='DELIVERY';const h=focusHarness(d);h.manager.focus(h.layout.find(c=>c.section==='items'&&c.fieldKey==='quantity'));
 const event=(key,extra={})=>({key,keyCode:0,nativeEvent:{isComposing:false},preventDefault(){this.prevented=true;},stopPropagation(){},...extra});
 let e=event('ArrowRight');handleCellKey(h.manager,h.current(),e,'input');assert.equal(h.current().fieldKey,'weight');assert.equal(e.prevented,true);
 handleCellKey(h.manager,h.current(),event('F2'),'input');e=event('ArrowLeft');handleCellKey(h.manager,h.current(),e,'input');assert.equal(h.current().fieldKey,'weight');assert.equal(e.prevented,undefined);
 h.manager.cancelEdit();e=event('ArrowDown');handleCellKey(h.manager,h.current(),e,'select',true);assert.equal(e.prevented,undefined);
 for(const ime of [{nativeEvent:{isComposing:true}},{keyCode:229}]){e=event('Enter',ime);handleCellKey(h.manager,h.current(),e,'input');assert.equal(e.prevented,undefined);assert.equal(h.current().fieldKey,'weight');}
 h.manager.compositionStart();e=event('Tab');handleCellKey(h.manager,h.current(),e,'input');assert.equal(e.prevented,undefined);h.manager.compositionEnd();
});
test('blocked date commit retains focus on Tab instead of falling through to native navigation',()=>{
 const {blank}=load('features/customer-ledger/utils/quickEntryDraft.ts');const {handleCellKey}=load('features/customer-ledger/utils/ledgerKeyboardNavigation.ts');const d=blank();const h=focusHarness(d);const date=h.layout.find(c=>c.fieldKey==='date');h.manager.register(date,{focus:()=>h.manager.selected(date),commit:()=>false});h.manager.focus(date);const e={key:'Tab',keyCode:0,nativeEvent:{isComposing:false},preventDefault(){this.prevented=true;},stopPropagation(){}};handleCellKey(h.manager,date,e,'date');assert.equal(e.prevented,true);assert.equal(h.manager.current().fieldKey,'date');
});

test('autocomplete focus waits for the committed dynamic field layout',()=>{
 const {blank}=load('features/customer-ledger/utils/quickEntryDraft.ts');const d=blank();d.type='DELIVERY';const h=focusHarness(d);const discount=h.layout.find(c=>c.fieldKey==='discountType');h.manager.focus(discount);h.manager.deferNext(discount,1,false);assert.equal(h.current().fieldKey,'discountType');d.discountType='PERCENT';h.refresh();assert.equal(h.current().fieldKey,'discount');
});

test('undoing a new row restores focus to a remaining cell in the same column',()=>{
 const {blank,line}=load('features/customer-ledger/utils/quickEntryDraft.ts');const d=blank();d.type='DELIVERY';d.lines.push(line());const h=focusHarness(d);h.manager.focus(h.layout.find(c=>c.section==='items'&&c.row===1&&c.fieldKey==='price'));d.lines.pop();h.refresh();assert.equal(h.current().rowId,d.lines[0].id);assert.equal(h.current().fieldKey,'price');
});
