import { CustomerGroupLaborPrices } from './CustomerGroupLaborPrices'
import { CatalogModelOption } from '../../catalog/CatalogModelOption'
import { useState } from 'react'
import { App, Button, Form, Modal, Popconfirm, Select, Space, Table, Tabs, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { RequestError } from '../../../components/common/RequestError'
import { decimalPattern, decimalText } from '../../../utils/decimal'
import { LedgerDecimalInput } from '../../customer-ledger/components/LedgerDecimalInput'
import { customerLaborPrices, laborPriceModels, saveCustomerLaborPrice, deleteCustomerLaborPrice, type ModelLaborPrice, type LaborPriceModel } from '../services/customerLaborPricesService'
const priceText = (value: string | null, currency: string | null) => {
  if (value == null) return '—'
  const [whole, fraction = ''] = value.split('.')
  const trimmed = fraction.replace(/0+$/, '')
  return `${decimalText(whole + (trimmed ? '.' + trimmed : ''))} ${currency === 'THB' ? 'B' : currency ?? ''}`
}
export function CustomerLaborPrices({ customerId }: { customerId: string }) {
  const { can } = usePermissions(), cache = useQueryClient(), { message } = App.useApp()
  const [mode, setMode] = useState('model')
  const [editing, setEditing] = useState<ModelLaborPrice | 'new' | null>(null)
  const [search, setSearch] = useState(''), [page, setPage] = useState(1)
  const [picked, setPicked] = useState<LaborPriceModel>()
  const [form] = Form.useForm<{model_id:string;price:string}>()
  const prices = useQuery({queryKey:['customer-labor-prices',customerId],queryFn:()=>customerLaborPrices(customerId)})
  const models = useQuery({queryKey:['customer-labor-price-models',customerId,search,page],queryFn:()=>laborPriceModels(customerId,search,page),enabled:editing==='new'})
  const refresh = () => { void cache.invalidateQueries({queryKey:['customer-labor-prices',customerId]}); void cache.invalidateQueries({queryKey:['quick-effective-prices']}) }
  const save = useMutation({mutationFn:(values:{model_id:string;price:string})=>saveCustomerLaborPrice(customerId,values.model_id,values.price,editing!=='new'),onSuccess:()=>{refresh();setEditing(null);message.success('Đã lưu giá công riêng')}})
  const remove = useMutation({mutationFn:(modelId:string)=>deleteCustomerLaborPrice(customerId,modelId),onSuccess:()=>{refresh();message.success('Đã xóa giá riêng mẫu; giao dịch mới dùng giá nhóm nếu có, sau đó giá mặc định')}})
  const open = (row:ModelLaborPrice|'new') => {
    save.reset(); setSearch(''); setPage(1); setPicked(undefined); setEditing(row)
    form.resetFields(); if(row!=='new') form.setFieldsValue({model_id:row.design_model_id,price:row.labor_price_per_15g})
  }
  const options = [...(models.data?.data ?? [])]
  if(picked && !options.some(row=>row.id===picked.id)) options.unshift(picked)
  const selected = editing && editing!=='new' ? editing : picked
  return <section style={{marginTop:24}}>
    <Space style={{width:'100%',justifyContent:'space-between',marginBottom:8}}><Typography.Title level={5} style={{margin:0}}>Giá công riêng</Typography.Title>{mode === 'model' && can('customers.update') && <Button size="small" disabled={prices.isPending || prices.isError} onClick={()=>open('new')}>Thêm giá</Button>}</Space>
    <Typography.Paragraph type="secondary" style={{fontSize:12}}>Giá riêng /15g dùng đơn vị B của sổ giao hàng. Ưu tiên giá riêng khách/mẫu → khách/nhóm → giá riêng mẫu → giá mặc định nhóm. Giá giao dịch đã lưu không đổi.</Typography.Paragraph>
    <Tabs activeKey={mode} onChange={setMode} size="small" items={[{key:'model',label:'Theo mẫu mã'},{key:'group',label:'Theo nhóm'}]} />
    <div hidden={mode !== 'model'}>
    <RequestError error={prices.error || remove.error} retry={()=>void prices.refetch()} />
    <Table<ModelLaborPrice> size="small" pagination={false} rowKey="design_model_id" loading={prices.isFetching} dataSource={prices.data ?? []} scroll={{x:540}} columns={[
      {title:'Mẫu mã',render:(_,row)=><><CatalogModelOption model={row} size={40} strong />{row.model_status!=='ACTIVE' && <small style={{color:'#788494'}}>Ngừng hoạt động</small>}</>},
      {title:'Mặc định /15g',align:'right',render:(_,row)=>priceText(row.default_labor_price_per_15g,row.default_labor_currency)},
      {title:'Giá riêng /15g',align:'right',render:(_,row)=><strong>{priceText(row.labor_price_per_15g,'THB')}</strong>},
      ...(can('customers.update')?[{title:'',width:115,render:(_:unknown,row:ModelLaborPrice)=><Space size={0}><Button type="link" size="small" onClick={()=>open(row)}>Sửa giá</Button><Popconfirm title="Xóa giá công riêng?" description="Giao dịch mới dùng giá nhóm nếu có, sau đó giá mặc định. Giao dịch đã lưu giữ nguyên giá." onConfirm={()=>remove.mutate(row.design_model_id)}><Button type="link" size="small" danger loading={remove.isPending && remove.variables===row.design_model_id}>Xóa</Button></Popconfirm></Space>}]:[]),
    ]} locale={{emptyText:'Chưa có giá công riêng'}} />
    </div>
    <div hidden={mode !== 'group'}><CustomerGroupLaborPrices customerId={customerId} active={mode === 'group'} /></div>
    <Modal open={!!editing} zIndex={1400} forceRender title={editing==='new'?'Thêm giá công riêng':'Sửa giá công riêng'} onCancel={()=>!save.isPending && setEditing(null)} onOk={()=>form.submit()} confirmLoading={save.isPending} okText="Lưu giá" cancelText="Hủy">
      <RequestError error={save.error} />
      <Form form={form} layout="vertical" disabled={save.isPending} onFinish={values=>save.mutate(values)}>
        <Form.Item name="model_id" label="Mẫu mã" rules={[{required:true,message:'Chọn mẫu mã'}]}>
          <Select style={{ height: 40, width: '100%' }} disabled={editing!=='new'} loading={models.isFetching} placeholder="Tìm tên hoặc mã mẫu mã" showSearch={{filterOption:false,onSearch:q=>{setSearch(q);setPage(1)}}} options={editing && editing!=='new'?[{value:editing.design_model_id,label:<CatalogModelOption model={editing} />,disabled:false}]:options.map(row=>({value:row.id,label:<CatalogModelOption model={row} />,disabled:prices.data?.some(price=>price.design_model_id===row.id)}))} onChange={id=>setPicked(options.find(row=>row.id===id))} popupRender={menu=><>{menu}<Space style={{padding:8}}><Button size="small" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Trước</Button><span>{page}</span><Button size="small" disabled={page*30>=(models.data?.meta.total ?? 0)} onClick={()=>setPage(p=>p+1)}>Sau</Button></Space></>} />
        </Form.Item>
        <RequestError error={editing==='new'?models.error:undefined} retry={()=>void models.refetch()} />
        {selected && <Typography.Paragraph type="secondary">Giá mặc định /15g: {priceText(selected.default_labor_price_per_15g,selected.default_labor_currency)}</Typography.Paragraph>}
        <Form.Item name="price" label="Giá công riêng /15g (B)" rules={[{required:true,message:'Nhập giá công, có thể bằng 0'},{pattern:decimalPattern,message:'Giá không âm, tối đa 4 chữ số thập phân'}]}><LedgerDecimalInput /></Form.Item>
      </Form>
    </Modal>
  </section>
}
