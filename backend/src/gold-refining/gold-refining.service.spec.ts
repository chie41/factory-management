import { describe, expect, it } from 'vitest';
import { calculateGoldTotals } from './gold-refining.service.js';
import type { GoldManualDto, GoldTemplateDto } from './gold-refining.dto.js';

const layout: GoldTemplateDto = {
 boxes:[{id:'b1',name:'Hộp 1',tareG:'455.0000'}],
 bagWeights:['1.20'],labelWeights:['0.40'],
};
const manual: GoldManualDto = {
 scales:[{box:'b1',gross:'1690.1300'},{box:'none',gross:'1177.9500'}],
 bags:[{name:'',unit:'1.20',count:'10'}],
 labels:[{name:'',unit:'0.40',count:'10'}],
 others:[{name:'Bổ sung',add:'12.50',subtract:''},{name:'Điều chỉnh',add:'',subtract:'4'}],
};
const source={
 businessDate:'2026-11-16',capturedAt:'2026-11-16T20:00:00+07:00',
 customerDebt:'2450.0000',
 workers:[{id:'w1',name:'Thợ 1',jobs:[
  {id:'a',title:'SX-1 · Hàn',workDate:'2026-11-15',issued:'200.0000',returned:'199.8000'},
  {id:'b',title:'SX-2 · Hàn',workDate:'2026-11-16',issued:'75.0000',returned:null},
 ]}],
};
describe('Tịnh vàng · số học chính xác và snapshot công việc',()=>{
 it('tính đúng Giao - Nhận, cân trừ vỏ, túi, nhãn và cộng/trừ',()=>{
  const result=calculateGoldTotals(source,['a','b'],manual,layout,'5100.0000',true);
  expect(result.worker_gold_g).toBe('75.2000');
  expect(result.scale_gold_g).toBe('2413.0800');
  expect(result.customer_debt_g).toBe('2450.0000');
  expect(result.bag_gold_g).toBe('12.0000');
  expect(result.label_gold_g).toBe('4.0000');
  expect(result.other_plus_g).toBe('12.5000');
  expect(result.other_minus_g).toBe('4.0000');
  expect(result.total_gold_g).toBe('4930.7800');
  expect(result.difference_g).toBe('-169.2200');
 });
 it('bỏ một công việc chỉ đổi kết quả phiên đang tính',()=>{
  const result=calculateGoldTotals(source,['a'],manual,layout,null,true);
  expect(result.worker_gold_g).toBe('0.2000');
  expect(result.total_gold_g).toBe('4855.7800');
  expect(result.difference_g).toBeNull();
  expect(source.workers[0].jobs).toHaveLength(2);
 });
 it('chặn mã công việc không thuộc nguồn dữ liệu snapshot',()=>{
  expect(()=>calculateGoldTotals(source,['unknown'],manual,layout,null))
    .toThrow(/snapshot/);
 });
 it('chặn cân nhỏ hơn trọng lượng vỏ và dòng thiếu trọng lượng khi chốt',()=>{
  expect(()=>calculateGoldTotals(source,['a'],{...manual,scales:[{box:'b1',gross:'100'}]},layout,null,true))
    .toThrow(/vỏ hộp/);
  expect(()=>calculateGoldTotals(source,['a'],{...manual,bags:[{name:'',unit:'1.20',count:''}]},layout,null,true))
    .toThrow(/thiếu trọng lượng hoặc số lượng/);
 });
});
