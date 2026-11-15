import { useState } from 'react'
import { App, Button, Form, Modal, Popconfirm, Select, Space, Table } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { RequestError } from '../../../components/common/RequestError'
import { decimalPattern, decimalText } from '../../../utils/decimal'
import { LedgerDecimalInput } from '../../customer-ledger/components/LedgerDecimalInput'
import { customerGroupLaborPrices, laborPriceGroups, saveCustomerGroupLaborPrice, deleteCustomerGroupLaborPrice, type GroupLaborPrice, type LaborPriceGroup } from '../services/customerLaborPricesService'
export function CustomerGroupLaborPrices({ customerId, active }: { customerId:string; active:boolean }) {
  const { can } = usePermissions(), cache = useQueryClient(), { message } = App.useApp()
  const [editing,setEditing] = useState<GroupLaborPrice|'new'|null>(null)
  const [search,setSearch] = useState(''), [page,setPage] = useState(1)
  const [picked,setPicked] = useState<LaborPriceGroup>()
  const [form] = Form.useForm<{group_id:string;price:string}>()
  const prices = useQuery({queryKey:['customer-group-labor-prices',customerId],queryFn:()=>customerGroupLaborPrices(customerId),enabled:active})
  const groups = useQuery({queryKey:['customer-labor-price-groups',customerId,search,page],queryFn:()=>laborPriceGroups(customerId,search,page),enabled:editing==='new'})
  const refresh = () => { void cache.invalidateQueries({queryKey:['customer-group-labor-prices',customerId]}); void cache.invalidateQueries({queryKey:['quick-effective-prices']}) }
  const save = useMutation({mutationFn:(values:{group_id:string;price:string})=>saveCustomerGroupLaborPrice(customerId,values.group_id,values.price,editing!=='new'),onSuccess:()=>{refresh();setEditing(null);message.success('Đã lưu giá riêng theo nhóm')}})
  const remove = useMutation({mutationFn:(groupId:string)=>deleteCustomerGroupLaborPrice(customerId,groupId),onSuccess:()=>{refresh();message.success('Đã xóa giá nhóm. Giá riêng mẫu được giữ nguyên; các mẫu còn lại dùng giá mặc định')}})
  const open = (row:GroupLaborPrice|'new') => {
    save.reset();setSearch('');setPage(1);setPicked(undefined);setEditing(row);form.resetFields()
    if(row!=='new')form.setFieldsValue({group_id:row.design_model_group_id,price:row.labor_price_per_15g})
  }
  const options = [...(groups.data?.data ?? [])]
  if(picked && !options.some(row=>row.id===picked.id))options.unshift(picked)
  return <div>
    {can('customers.update') && <div style={{textAlign:'right',marginBottom:8}}><Button size="small" disabled={prices.isPending || prices.isError} onClick={()=>open('new')}>Thêm giá</Button></div>}
    <RequestError error={prices.error || remove.error} retry={()=>void prices.refetch()} />
    <Table<GroupLaborPrice> size="small" rowKey="design_model_group_id" pagination={false} loading={prices.isFetching} dataSource={prices.data ?? []} scroll={{x:440}} locale={{emptyText:'Chưa có giá công riêng theo nhóm'}} columns={[
      {title:'Nhóm mẫu mã',dataIndex:'name',render:name=><strong>{name}</strong>},
      {title:'Số mẫu',dataIndex:'model_count',align:'right'},
      {title:'Giá riêng /15g',align:'right',render:(_,row)=><strong>{decimalText(row.labor_price_per_15g)} B</strong>},
      ...(can('customers.update')?[{title:'',width:115,render:(_:unknown,row:GroupLaborPrice)=><Space size={0}><Button type="link" size="small" onClick={()=>open(row)}>Sửa giá</Button><Popconfirm title="Xóa giá riêng theo nhóm?" description="Giữ giá riêng từng mẫu nếu có; mẫu còn lại dùng giá mặc định. Giao dịch đã lưu không đổi." onConfirm={()=>remove.mutate(row.design_model_group_id)}><Button type="link" size="small" danger loading={remove.isPending && remove.variables===row.design_model_group_id}>Xóa</Button></Popconfirm></Space>}]:[]),
    ]} />
    <Modal open={!!editing} forceRender zIndex={1400} title={editing==='new'?'Thêm giá công riêng theo nhóm':'Sửa giá công riêng theo nhóm'} onCancel={()=>!save.isPending && setEditing(null)} onOk={()=>form.submit()} confirmLoading={save.isPending} okText="Lưu giá" cancelText="Hủy">
      <RequestError error={save.error} />
      <Form form={form} layout="vertical" disabled={save.isPending} onFinish={values=>save.mutate(values)}>
        <Form.Item name="group_id" label="Nhóm mẫu mã" rules={[{required:true,message:'Chọn nhóm mẫu mã'}]}>
          <Select disabled={editing!=='new'} loading={groups.isFetching} placeholder="Tìm nhóm mẫu mã" showSearch={{filterOption:false,onSearch:q=>{setSearch(q);setPage(1)}}} options={editing && editing!=='new'?[{value:editing.design_model_group_id,label:editing.name,disabled:false}]:options.map(row=>({value:row.id,label:row.name,disabled:prices.data?.some(price=>price.design_model_group_id===row.id)}))} onChange={id=>setPicked(options.find(row=>row.id===id))} popupRender={menu=><>{menu}<Space style={{padding:8}}><Button size="small" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Trước</Button><span>{page}</span><Button size="small" disabled={page*30>=(groups.data?.meta.total ?? 0)} onClick={()=>setPage(p=>p+1)}>Sau</Button></Space></>} />
        </Form.Item>
        <RequestError error={editing==='new'?groups.error:undefined} retry={()=>void groups.refetch()} />
        <Form.Item name="price" label="Giá công riêng /15g (B)" rules={[{required:true,message:'Nhập giá công, có thể bằng 0'},{pattern:decimalPattern,message:'Giá không âm, tối đa 4 chữ số thập phân'}]}><LedgerDecimalInput /></Form.Item>
      </Form>
    </Modal>
  </div>
}
