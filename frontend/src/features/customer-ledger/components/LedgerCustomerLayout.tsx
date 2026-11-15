import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Input, message, Modal, Space, Switch, Tag } from 'antd'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { workflowGet, workflowWrite } from '../services/workflowService'
import { markLedgerDraft } from '../hooks/ledgerDraftGuard'
type Item = { id: string; name: string; customer_code: string; is_visible_in_ledger: boolean }
type Layout = { revision: string; items: Item[] }
function Row({ item, index, disabled, toggle }: { item: Item; index: number; disabled: boolean; toggle: () => void }) {
 const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: item.id, disabled })
 return <div ref={setNodeRef} className="ledger-layout-row" style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 2 : 0, boxShadow: isDragging ? '0 4px 14px #0003' : undefined, borderTop: isOver ? '2px solid #1677ff' : undefined, opacity: item.is_visible_in_ledger ? 1 : 0.6 }}>
 <Button {...attributes} {...listeners} disabled={disabled} aria-label={`Kéo ${item.name}`} style={{ touchAction: 'none', cursor: 'grab' }}>⠿</Button>
 <span>{index + 1}</span><span style={{ flex: 1 }}>{item.customer_code} · {item.name}</span>
 <Tag>{item.is_visible_in_ledger ? 'Đang hiển thị' : 'Đã ẩn'}</Tag><Switch aria-label={`Hiển thị ${item.name}`} checked={item.is_visible_in_ledger} disabled={disabled} onChange={toggle} />
 </div>
}
export function LedgerCustomerLayout({ close }: { close: () => void }) {
 const [initial, setInitial] = useState<Layout>()
 const [items, setItems] = useState<Item[]>([])
 const [error, setError] = useState('')
 const [saving, setSaving] = useState(false)
 const savingRef = useRef(false)
 const [q, setQ] = useState('')
 const [showHidden, setShowHidden] = useState(true)
 const cache = useQueryClient()
 const dirty = !!initial && JSON.stringify(items) !== JSON.stringify(initial.items)
 const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
 const load = () => { setError(''); workflowGet<Layout>('/customer-ledger/customer-layout').then(data => { setInitial(data); setItems(data.items) }).catch(() => setError('Không tải được danh sách khách hàng.')) }
 useEffect(() => { let active = true; workflowGet<Layout>('/customer-ledger/customer-layout').then(data => { if (active) { setInitial(data); setItems(data.items) } }).catch(() => { if (active) setError('Không tải được danh sách khách hàng.') }); return () => { active = false } }, [])
 useEffect(() => {
  markLedgerDraft('customer-layout', dirty)
  const before = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
  window.addEventListener('beforeunload', before)
  return () => { markLedgerDraft('customer-layout', false); window.removeEventListener('beforeunload', before) }
 }, [dirty])
 const cancel = () => { if (!savingRef.current && (!dirty || window.confirm('Hủy thay đổi thứ tự và ẩn/hiện chưa lưu?'))) close() }
 const save = async () => {
  if (!initial || savingRef.current) return
  savingRef.current = true; setSaving(true); setError('')
  try {
   await workflowWrite('/customer-ledger/customer-layout', { revision: initial.revision, items: items.map(({ id, is_visible_in_ledger }) => ({ id, is_visible_in_ledger })) }, 'patch')
   await Promise.all([
    cache.invalidateQueries({ queryKey: ['ledger', 'summary'] }),
    cache.invalidateQueries({ queryKey: ['customer-ledger', 'daily-gold'] }),
   ])
   message.success('Đã lưu thứ tự và trạng thái hiển thị'); close()
  } catch (e) {
   const response = e as { response?: { data?: { message?: string } } }
   setError(response.response?.data?.message ?? 'Lưu thất bại. Thay đổi vẫn được giữ để thử lại.')
  } finally { savingRef.current = false; setSaving(false) }
 }
 const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d').toLocaleLowerCase()
 const shown = items.filter(i => (showHidden || i.is_visible_in_ledger) && normalize(i.name + ' ' + i.customer_code).includes(normalize(q.trim())))
 return <Modal open title="Sắp xếp khách hàng" width={850} onCancel={cancel} maskClosable={false} closable={!saving} footer={<Space><Button disabled={saving} onClick={cancel}>Hủy</Button><Button type="primary" loading={saving} disabled={!initial || !dirty} onClick={() => void save()}>Lưu thay đổi</Button></Space>}>
 {error && <Alert type="error" title={error} action={!initial && <Button onClick={load}>Thử lại</Button>} />}
 <Space wrap style={{ margin: '12px 0' }}><Input placeholder="Tìm mã / tên khách hàng" value={q} disabled={saving} onChange={e => setQ(e.target.value)} /><Checkbox checked={showHidden} disabled={saving} onChange={e => setShowHidden(e.target.checked)}>Hiển thị khách hàng đã ẩn</Checkbox></Space>
 <p>Kéo tay nắm để đổi thứ tự trên toàn bộ danh sách. STT giữ vị trí chung khi tìm kiếm. Bàn phím: Space để chọn, mũi tên để di chuyển.</p>
 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
  if (!over || active.id === over.id || savingRef.current) return
  setItems(previous => arrayMove(previous, previous.findIndex(i => i.id === active.id), previous.findIndex(i => i.id === over.id)))
 }}><SortableContext items={shown.map(i => i.id)} strategy={verticalListSortingStrategy}>
 <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>{shown.map(item => <Row key={item.id} item={item} index={items.findIndex(i => i.id === item.id)} disabled={saving} toggle={() => setItems(previous => previous.map(i => i.id === item.id ? { ...i, is_visible_in_ledger: !i.is_visible_in_ledger } : i))} />)}{!initial && !error && 'Đang tải…'}</div>
 </SortableContext></DndContext>
 </Modal>
}
