import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { calendarDate, decimal, HEADERS, parseSheets, readExcel } from './excel-parser.js';
const line=(fields:Record<number,string>)=>Array.from({length:17},(_,i)=>fields[i]??'');
const delivery=line({0:'01/10/2026',1:'Nhân viên A',4:'30',6:'Mẫu A',7:'1',8:'15',9:'15',10:'10',11:'10',12:'20'});
const continuation=line({6:'Mẫu B',7:'1',8:'15',9:'15',10:'10',11:'10'});
const sheet=(rows:string[][])=>[{name:'Sổ',rows:rows.map((cells,i)=>({row:i+2,cells:[...cells]}))}];
describe('Excel ledger grouping preserves historical structure',()=>{
 it('groups adjacent detail rows with blank dates under exactly one delivery',()=>{
  const {groups}=parseSheets(sheet([delivery,continuation]),false);
  expect(groups).toHaveLength(1);expect(groups[0]).toMatchObject({kind:'DELIVERY',date:'2026-10-01',gold:'30.0000',labor:'20.0000',rows:[2,3],errors:[]});
  expect(groups[0].lines).toHaveLength(2);
 });
 it('does not combine two deliveries just because they share a date',()=>{
  const start=line({0:'01/10/2026',1:'A',4:'15',6:'Mẫu A',7:'1',8:'15',10:'10',12:'10'});
  expect(parseSheets(sheet([start,start]),false).groups).toHaveLength(2);
 });
 it('recognizes all three operations on the same row and uses the receipt date independently',()=>{
  const cells=line({0:'01/10/2026',1:'A',3:'5',4:'15',6:'Mẫu',7:'1',8:'15',10:'10',13:'03/10/2026',14:'5',15:'Người thu',16:'Ghi chú'});
  const {groups}=parseSheets(sheet([cells]),false);
  expect(groups.map(g=>g.kind)).toEqual(['DELIVERY','RETURN_GOLD','PAYMENT']);
  expect(groups[2]).toMatchObject({date:'2026-10-03',parent:groups[0].id,amount:'5.0000',collector:'Người thu'});
 });
 it('does not fill a missing gold receipt or payment date from the previous delivery',()=>{
  const cells=line({3:'5',13:'',14:'3',15:'B'});
  const {groups}=parseSheets(sheet([delivery,continuation,cells]),false);
  expect(groups[1].errors.join()).toContain('Ngày không hợp lệ');
  expect(groups[2].errors.join()).toContain('Ngày không hợp lệ');
  expect(groups[2].parent).toBeUndefined();
 });
 it('skips balance-only, old-debt and total rows without adjustment transactions',()=>{
  const {groups,ignored}=parseSheets(sheet([line({0:'NỢ CŨ',2:'900'}),line({2:'901',5:'905'}),line({6:'TỔNG CỘNG',4:'999'})]),false);
  // Vietnamese total labels with CỘNG are handled as summaries too.
  expect(groups).toEqual([]);
  expect(ignored).toHaveLength(3);
 });
 it('blocks inconsistent weights and labor without altering source values',()=>{
  const cells=[...delivery];cells[4]='31';cells[11]='999';
  const {groups}=parseSheets(sheet([cells,continuation]),false);
  expect(groups[0].gold).toBe('31.0000');expect(groups[0].errors.join()).toContain('không khớp GIAO');
  expect(groups[0].errors.join()).toContain('CÔNG khác công thức');
 });
 it('does not silently attach a different customer or an explicit split to the previous group',()=>{
  const rows=sheet([delivery,continuation]);
  const result=parseSheets(rows,false,[],[{sheet:'Sổ',row:3}]);
  expect(result.groups[1].kind).toBe('REVIEW');expect(result.groups[0].errors.length).toBeGreaterThan(0);
  const bulkRows=sheet([delivery,continuation]);bulkRows[0].rows[0].cells.splice(1,0,'Khách A');bulkRows[0].rows[1].cells.splice(1,0,'Khách B');
  expect(parseSheets(bulkRows,true).groups[1].kind).toBe('REVIEW');
 });
 it('reparses explicit corrections while leaving original source rows intact',()=>{
  const original=sheet([delivery,continuation]);const fixed=[...delivery];fixed[4]='31';
  const result=parseSheets(original,false,[{sheet:'Sổ',row:2,cells:fixed}]);
  expect(result.groups[0].gold).toBe('31.0000');expect(original[0].rows[0].cells[4]).toBe('30');
 });
 it('uses a stable content hash independent of row numbers and sheet names',()=>{
  const first=parseSheets(sheet([delivery,continuation]),false).groups[0];
  const moved=[{name:'Khác',rows:[{row:20,cells:delivery},{row:21,cells:continuation}]}];
  expect(parseSheets(moved,false).groups[0].content_hash).toBe(first.content_hash);
 });
 it('strictly validates dates and decimal precision',()=>{
  expect(calendarDate('31/12/2026')).toBe('2026-12-31');expect(()=>calendarDate('31/02/2026')).toThrow();
  expect(decimal('0,125')).toBe('0.1250');expect(()=>decimal('1.000,25')).toThrow();expect(()=>decimal('1.12345')).toThrow();
  expect(()=>decimal('1,000')).toThrow();
 });
 it('ignores formatted zero gold/payment cells without creating fake movements',()=>{
  expect(parseSheets(sheet([line({3:'0.00',4:'0,0000',14:'0.000'})]),false).groups).toEqual([]);
 });
 it('reads Excel dates, cached formulas, merged delivery cells and two-tier headers',async()=>{
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('Sổ');
  ws.addRow(HEADERS);ws.addRow(delivery);ws.addRow(continuation);
  ws.getCell('A2').value=new Date('2026-10-01T00:00:00Z');ws.mergeCells('E2:E3');
  ws.getCell('J3').value={formula:'H3*I3',result:15};
  const file=Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  const sheets=await readExcel(file,false);expect(sheets[0].rows[1].cells[4]).toBe('');
  expect(parseSheets(sheets,false).groups[0].errors).toEqual([]);
  const second=new ExcelJS.Workbook();const sh=second.addWorksheet('Sổ');
  sh.addRow(HEADERS.map((h,i)=>i===8||i===9?'TRỌNG LƯỢNG':h));
  sh.addRow(HEADERS.map((h,i)=>i===8?'ĐƠN':i===9?'TỔNG':h));
  sh.addRow(delivery);sh.addRow(continuation);
  expect((await readExcel(Buffer.from(await second.xlsx.writeBuffer()).toString('base64'),false))[0].rows[0].row).toBe(3);
 });
 it('requires the bulk customer column and rejects invalid files',async()=>{
  const wb=new ExcelJS.Workbook();wb.addWorksheet('Sổ').addRows([HEADERS,delivery]);
  await expect(readExcel(Buffer.from(await wb.xlsx.writeBuffer()).toString('base64'),true)).rejects.toThrow('không nhận diện');
  await expect(readExcel('aGVsbG8=',false)).rejects.toThrow('Chỉ hỗ trợ');
 });
});
