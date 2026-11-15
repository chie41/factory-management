import { useEffect, useState } from 'react'
import { Button, Input, Modal, Radio, Space, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { GoldInput, numberOrNull } from './GoldDailyTables'
import { cloneGoldTemplate, type GoldLayoutTemplate } from './goldLayoutTemplate'

export type LayoutSaveScope = 'day' | 'future'

type Props = {
  open: boolean
  date: string
  initial: GoldLayoutTemplate
  onCancel: () => void
  onSave: (template: GoldLayoutTemplate, scope: LayoutSaveScope) => void
}
export function GoldLayoutSettings({ open, date, initial, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState<GoldLayoutTemplate>(() => cloneGoldTemplate(initial))
  const [scope, setScope] = useState<LayoutSaveScope>('day')
  useEffect(() => {
    if (open) {
      setDraft(cloneGoldTemplate(initial))
      setScope('day')
    }
  }, [open, initial])
  const editBox = (index: number, field: 'name' | 'tareG', value: string) => {
    setDraft(previous => ({ ...previous, boxes: previous.boxes.map((box, i) => i === index ? { ...box, [field]: value } : box) }))
  }
  const editWeight = (field: 'bagWeights' | 'labelWeights', index: number, value: string) => {
    setDraft(previous => ({ ...previous, [field]: previous[field].map((item, i) => i === index ? value : item) }))
  }
  const validBoxes = draft.boxes.every(box => box.name.trim() && numberOrNull(box.tareG) !== null)
  const validWeights = [...draft.bagWeights, ...draft.labelWeights].every(v => !v || numberOrNull(v) !== null)
  return <Modal
    title="Thiết lập mẫu nhập Tịnh vàng"
    open={open}
    width={700}
    onCancel={onCancel}
    okText={scope === 'day' ? 'Áp dụng riêng ngày này' : 'Áp dụng từ ngày này'}
    okButtonProps={{ disabled: !validBoxes || !validWeights }}
    onOk={() => onSave(cloneGoldTemplate(draft), scope)}
  >
    <Typography.Paragraph type="secondary">
      Cấu hình danh sách hộp, trọng lượng túi bóng và các dòng nhãn đá xuất hiện trong biểu mẫu.
      Không thay đổi số cân, số lượng hoặc số vàng đã nhập.
    </Typography.Paragraph>
    <div className="gold-setup-section">
      <strong>Hộp cân</strong>
      <Typography.Text type="secondary">Không hộp · 0g luôn có sẵn.</Typography.Text>
      <div className="gold-setup-head"><span>TÊN HỘP</span><span>TRỌNG LƯỢNG VỎ (g)</span><span/></div>
      {draft.boxes.map((box, i) => <div className="gold-setup-row" key={box.id}>
        <Input size="small" aria-label="Tên hộp" placeholder="Hộp 01" value={box.name} onChange={e => editBox(i, 'name', e.target.value)} />
        <GoldInput value={box.tareG} onChange={v => editBox(i, 'tareG', v)} />
        <Button aria-label={'Xóa hộp ' + box.name} size="small" type="text" icon={<DeleteOutlined />} onClick={() => setDraft(p => ({ ...p, boxes: p.boxes.filter(item => item.id !== box.id) }))} />
      </div>)}
      <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => setDraft(p => ({ ...p, boxes: [...p.boxes, { id: 'box-'+crypto.randomUUID(), name: '', tareG: '' }] }))}>Thêm hộp</Button>
    </div>
    <div className="gold-setup-section">
      <strong>Trọng lượng túi bóng mặc định (g)</strong>
      <div className="gold-setup-chips">
        {draft.bagWeights.map((value, i) => <Space.Compact key={i} className="gold-setup-weight">
          <GoldInput value={value} onChange={v => editWeight('bagWeights', i, v)} />
          <Button size="small" aria-label={'Xóa loại túi '+(i+1)} icon={<DeleteOutlined />} onClick={() => setDraft(p => ({ ...p, bagWeights: p.bagWeights.filter((_, index) => index !== i) }))} />
        </Space.Compact>)}
      </div>
      <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => setDraft(p => ({ ...p, bagWeights: [...p.bagWeights, ''] }))}>Thêm trọng lượng túi</Button>
    </div>
    <div className="gold-setup-section">
      <strong>Các dòng nhãn đá / vật liệu phụ</strong>
      <Typography.Text type="secondary">Mỗi dòng có thể để trống rồi điền khi cân.</Typography.Text>
      <div className="gold-setup-chips">
        {draft.labelWeights.map((value, i) => <Space.Compact key={i} className="gold-setup-weight">
          <GoldInput value={value} onChange={v => editWeight('labelWeights', i, v)} />
          <Button size="small" aria-label={'Xóa dòng nhãn đá '+(i+1)} icon={<DeleteOutlined />} onClick={() => setDraft(p => ({ ...p, labelWeights: p.labelWeights.filter((_, index) => index !== i) }))} />
        </Space.Compact>)}
      </div>
      <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => setDraft(p => ({ ...p, labelWeights: [...p.labelWeights, ''] }))}>Thêm dòng nhãn đá</Button>
    </div>
    <div className="gold-setup-scope">
      <strong>Áp dụng thay đổi</strong>
      <Radio.Group value={scope} onChange={e => setScope(e.target.value as LayoutSaveScope)}>
        <Space direction="vertical">
          <Radio value="day">Chỉ ngày {date} — ngày khác giữ mẫu cũ</Radio>
          <Radio value="future">Mặc định từ ngày {date} trở đi — các phiên đã mở không tự thay đổi</Radio>
        </Space>
      </Radio.Group>
      <Typography.Text type="secondary">
        Bản xem trước: cấu hình hiện chỉ giữ trong bộ nhớ trang, chưa lưu lên máy chủ.
      </Typography.Text>
    </div>
  </Modal>
}
