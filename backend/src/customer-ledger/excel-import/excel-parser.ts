import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { units, toDecimal } from '../ledger-decimal.js';
import { TRANSACTION_TYPES } from '../dto/create-ledger-entry.dto.js';
import { GOLD_DEBT_SIGN } from '../gold-debt-rules.js';
import { emptyFormulaResults, type ExcelZipEntry } from './excel-formula-cache.js';

export const HEADERS = ['NGÀY','LOẠI GIAO DỊCH','NGƯỜI GIAO DỊCH','NỢ','NHẬN (-)','GIAO (+)','TÍNH','CHI TIẾT','SỐ LƯỢNG','TRỌNG LƯỢNG ĐƠN','TRỌNG LƯỢNG TỔNG','GIÁ CÔNG','CÔNG','TỔNG CÔNG','NGÀY THU','SỐ TIỀN','NGƯỜI THU','GHI CHÚ'];
export const normalized = (value: string) => value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
const headerKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toUpperCase().replace(/[^A-Z0-9]/g,'');
const TYPE_LABELS: Record<(typeof TRANSACTION_TYPES)[number],string> = {
 DELIVERY:'Giao hàng', RETURN_GOLD:'Khách trả vàng', GOLD_RETURN_TO_CUSTOMER:'Trả vàng cho khách',
 RETURN_RECOVERED_GOLD:'Khách trả vàng hồi', RETURN_GOODS:'Trả hàng',
};
export const IMPORT_TRANSACTION_OPTIONS: {value:(typeof TRANSACTION_TYPES)[number]|'PAYMENT';label:string}[] = [
 ...TRANSACTION_TYPES.map(value=>({value,label:TYPE_LABELS[value]})),
 {value:'PAYMENT',label:'Thu tiền công'},
];
function resolveTransactionType(value:string): (typeof TRANSACTION_TYPES)[number]|'PAYMENT'|undefined {
 return IMPORT_TRANSACTION_OPTIONS.find(option=>headerKey(option.value)===headerKey(value)||headerKey(option.label)===headerKey(value))?.value;
}
export type SourceRow = {
 row: number; cells: string[];
 merged?: Record<number,{master_row:number;master_column:number;value:string}>;
};
export type ImportSheet = { name: string; rows: SourceRow[] };
export type ImportLine = { row: number; name: string; quantity: number; unit_weight_g: string; total_weight_g: string; price: string; labor: string };
export type ImportGroup = {
 id: string; sheet: string; rows: number[]; kind: (typeof TRANSACTION_TYPES)[number]|'PAYMENT'|'REVIEW'; type_row?: number; declared_type?: string; customer: string;
 date: string; date_row?:number; date_column?:number; date_inherited?:boolean; date_source_row?:number;
 employee: string; gold: string; lines: ImportLine[]; labor: string; collector: string; amount: string;
 note: string; parent?: string; errors: string[]; warnings: string[]; content_hash: string;
};
export type RowEdit = { sheet: string; row: number; cells: string[] };
export type Split = { sheet: string; row: number };
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function decimal(value: string): string {
 let text = value.trim().replace(/\s/g,'');
 // A comma followed by three digits may be a thousands separator: require an Excel number instead.
 if (/^\d+,\d{1,4}$/.test(text) && !/^[1-9]\d*,\d{3}$/.test(text)) text = text.replace(',','.');
 if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/.test(text)) throw Error(`Số không hợp lệ hoặc dấu phân cách chưa rõ: ${value}`);
 return toDecimal(units(text));
}
export function calendarDate(value: string): string {
 let text = value.trim();
 const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
 if (match) text = `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
 if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0,10)!==text) throw Error(`Ngày không hợp lệ: ${value || '(trống)'}`);
 return text;
}
function cellText(value: ExcelJS.CellValue): string {
 if (value == null) return '';
 if (value instanceof Date) return value.toISOString().slice(0,10);
 if (typeof value === 'object') {
  if ('formula' in value || 'sharedFormula' in value) return 'result' in value && value.result != null ? cellText(value.result as ExcelJS.CellValue) : '#FORMULA_NO_RESULT';
  if ('richText' in value) return value.richText.map(part=>part.text).join('');
  if ('text' in value) return String(value.text);
  return '#CELL_ERROR';
 }
 return String(value);
}
export async function readExcel(base64: string, bulk: boolean): Promise<ImportSheet[]> {
 if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length>6_000_000) throw new BadRequestException('File .xlsx tối đa 4 MB');
 const buffer = Buffer.from(base64,'base64');
 if (buffer.length>4*1024*1024 || buffer.subarray(0,2).toString()!=='PK') throw new BadRequestException('Chỉ hỗ trợ file .xlsx, tối đa 4 MB');
 // Bound decompression before ExcelJS loads the archive into memory. ZIP64/encrypted workbooks are not supported.
 let end=-1;
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new BadRequestException('Cấu trúc file Excel không hợp lệ');
 const entryCount=buffer.readUInt16LE(end+10);let offset=buffer.readUInt32LE(end+16),expanded=0;
 const zipEntries=new Map<string,ExcelZipEntry>();
 if(entryCount>500||offset>=end)throw new BadRequestException('File Excel có cấu trúc quá lớn');
 for(let i=0;i<entryCount;i++) {
  if(offset+46>end||buffer.readUInt32LE(offset)!==0x02014b50)throw new BadRequestException('Danh mục ZIP không hợp lệ');
  expanded+=buffer.readUInt32LE(offset+24);
  if(expanded>64*1024*1024||(buffer.readUInt16LE(offset+8)&1))throw new BadRequestException('File Excel giải nén quá 64 MB hoặc được mã hóa');
  const nameLength=buffer.readUInt16LE(offset+28);
  const entryEnd=offset+46+nameLength+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
  if(entryEnd>end)throw new BadRequestException('Danh mục ZIP không đầy đủ');
  zipEntries.set(buffer.toString('utf8',offset+46,offset+46+nameLength),{
   method:buffer.readUInt16LE(offset+10),compressed:buffer.readUInt32LE(offset+20),
   expanded:buffer.readUInt32LE(offset+24),localOffset:buffer.readUInt32LE(offset+42),
  });
  offset=entryEnd;
 }
 const workbook = new ExcelJS.Workbook();
 try { await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer); }
 catch { throw new BadRequestException('Không đọc được Excel. Kiểm tra định dạng .xlsx và mật khẩu file.'); }
 const cachedEmpty=emptyFormulaResults(buffer,zipEntries);
 const expected = [...HEADERS]; if (bulk) expected.splice(1,0,'KHÁCH HÀNG');
 const sheets: ImportSheet[] = [];
 let count = 0;
 for (const sheet of workbook.worksheets) {
  if (sheet.rowCount>10000 || sheet.columnCount>100) throw new BadRequestException('Mỗi sheet tối đa 10.000 dòng và 100 cột');
  let header = 0;
  for(let row=1;row<=Math.min(50,sheet.rowCount);row++) {
   const score = expected.filter((name,index)=>headerKey(cellText(sheet.getCell(row,index+1).value))===headerKey(name)).length;
   const combined = expected.filter((name,index)=>{
    const top=headerKey(cellText(sheet.getCell(row,index+1).value));
    const bottom=headerKey(cellText(sheet.getCell(row+1,index+1).value));
    const key=headerKey(name);
    return [top,bottom,top+bottom,bottom+top].includes(key);
   }).length;
   if(score===expected.length) { header=row; break; }
   if(combined===expected.length) { header=row+1; break; }
  }
  if (!header) {
   if (sheet.name==='Hướng dẫn' || !sheet.actualRowCount) continue;
   throw new BadRequestException(`Sheet ${sheet.name}: không nhận diện đủ cột mẫu ${bulk?'Import chung':'Import riêng'} (header 1 hoặc 2 tầng)`);
  }
  const rows: SourceRow[]=[];
  const readValue=(cell:ExcelJS.Cell,index:number):string=>{
   let value=cell.value;
   if(value && typeof value==='object' && ('formula' in value || 'sharedFormula' in value)) {
    if(!('result' in value) || value.result==null)return cachedEmpty.get(Number(sheet.id))?.has(cell.address)?'':'#FORMULA_NO_RESULT';
    value=value.result as ExcelJS.CellValue;
   }
   const dateColumn=index===0 || index===expected.indexOf('NGÀY THU');
   if(dateColumn && typeof value==='number') {
    if(!Number.isFinite(value)||value<0||value>2957003)return '#INVALID_EXCEL_DATE';
    if(value===60 && !workbook.properties.date1904)return '#INVALID_EXCEL_DATE';
    return new Date(Date.UTC(1899,11,30)+(value+(workbook.properties.date1904?1462:value<60?1:0))*86400000).toISOString().slice(0,10);
   }
   return cellText(value);
  };
  for(let row=header+1;row<=sheet.rowCount;row++) {
   const merged:NonNullable<SourceRow['merged']>={};
   const cells = expected.map((_,index)=> {
    const cell=sheet.getCell(row,index+1);
    if(cell.isMerged && cell.master.address!==cell.address) {
     const master=cell.master;
     // Keep provenance, but never copy a merged amount/type into every source row.
     if(Number(master.row)>header)merged[index]={master_row:Number(master.row),master_column:Number(master.col)-1,value:readValue(master,index)};
     return '';
    }
    return readValue(cell,index);
   });
   if(cells.some(Boolean)) { rows.push({row,cells,...(Object.keys(merged).length?{merged}:{})}); if(++count>10000) throw new BadRequestException('Tối đa 10.000 dòng dữ liệu mỗi file'); }
  }
  if(rows.length)sheets.push({name:sheet.name,rows});
 }
 if(!sheets.length) throw new BadRequestException('Không có dòng dữ liệu để import trong sheet đúng mẫu');
 return sheets;
}

export function parseSheets(sheets: ImportSheet[], bulk: boolean, edits: RowEdit[] = [], splits: Split[] = [], ignoredRows:Split[] = []) {
 const groups: ImportGroup[]=[];
 const ignored: {sheet:string;row:number;reason:string}[]=[];
 const editKeys=new Set<string>();
 const excluded=new Set<string>();
 for(const item of ignoredRows) {
  const key=JSON.stringify([item.sheet,item.row]);
  if(!sheets.some(sheet=>sheet.name===item.sheet&&sheet.rows.some(row=>row.row===item.row)))throw new BadRequestException('Dòng bỏ qua không tồn tại trong file');
  excluded.add(key);
 }
 for(const edit of edits) {
  const key=`${edit.sheet}:${edit.row}`;
  if(editKeys.has(key) || !sheets.some(s=>s.name===edit.sheet && s.rows.some(r=>r.row===edit.row)) || edit.cells.length!==(bulk?19:18)) throw new BadRequestException('Dòng sửa không hợp lệ');
  editKeys.add(key);
 }
 for(const sheet of sheets) {
  let parent: ImportGroup|undefined;
  let lastRow=0;
  let currentDate='';
  let currentDateRow:number|undefined;
  let currentCustomer='';
  let foundTransaction=false;
  let regionStartRow=0;
  const resetRegion=(startRow:number)=>{parent=undefined;currentDate='';currentDateRow=undefined;currentCustomer='';regionStartRow=startRow;foundTransaction=false;};
  const make=(kind:ImportGroup['kind'],row:number,customer:string):ImportGroup=> {
   const g:ImportGroup={id:`${sheet.name}:${row}:${kind}`,sheet:sheet.name,rows:[row],kind,customer,date:'',employee:'',gold:'',lines:[],labor:'',collector:'',amount:'',note:'',errors:[],warnings:[],content_hash:''};
   groups.push(g);return g;
  };
  for(const source of sheet.rows) {
   if(source.row!==lastRow+1)resetRegion(source.row);
   const raw=edits.find(e=>e.sheet===sheet.name && e.row===source.row)?.cells ?? source.cells;
   const context=(column:number):string=>{
    if(raw[column]?.trim())return raw[column];
    const merge=source.merged?.[column];
    // Horizontal merges are labels, not a shared value for adjacent business fields.
    if(!merge || merge.master_column!==column || merge.master_row<regionStartRow)return raw[column]??'';
    const masterEdit=edits.find(edit=>edit.sheet===sheet.name && edit.row===merge.master_row);
    return masterEdit?masterEdit.cells[column]:merge.value;
   };
   const customer=bulk?context(1).trim():'';
   const values=[...raw];if(bulk)values.splice(1,1);
   const [rawDate,declaredType,_rawEmployee,_debt,receive,deliver,_balance,detail,quantity,unitWeight,totalWeight,price,labor,totalLabor,rawPaymentDate,amount,rawCollector,note]=values;
   let date=context(0).trim();
   let employee=context(bulk?3:2).trim();
   const paymentColumn=HEADERS.indexOf('NGÀY THU')+(bulk?1:0);
   let paymentDate=context(paymentColumn).trim();
   let collector=context(HEADERS.indexOf('NGƯỜI THU')+(bulk?1:0)).trim();
   const summary=/^(NOCU|SODU|SODUDAUKY|DAUKY|TONGCONG|TONGKET|CONGNO|TONG)$/.test(headerKey(detail || date || employee));
   const hasGold=(value:string)=>value!=='' && !/^0+(?:[.,]0+)?$/.test(value.trim());
   const hasProductFields=!!(quantity||unitWeight||totalWeight||price||labor||totalLabor);
   const hasDetails=!!detail||hasProductFields;
   // Merged receipt context must not turn every product line into another receipt.
   const hasPayment=!!(rawPaymentDate||rawCollector||hasGold(amount));
   // A prelude containing both gold totals and labor/payment totals, without any
   // transaction identity or product data, is a summary rather than a transaction.
   // Inspect the original cells so mistaken preview edits cannot turn it into business data.
   const original=[...source.cells];if(bulk)original.splice(1,1);
   const positive=(value:string)=>{try{return units(decimal(value))>0n;}catch{return false;}};
   const numericSummary=!foundTransaction&&!original[0]&&!original[1]&&!original[2]
    && !original[7]&&!original[8]&&!original[9]&&!original[10]&&!original[11]&&!original[12]
    && !original[14]&&!original[16]&&(!bulk||!source.cells[1])
    && positive(original[4])&&positive(original[5])&&(positive(original[13])||positive(original[15]));
   const splitHere=splits.some(s=>s.sheet===sheet.name && s.row===source.row);
   if(splitHere)parent=undefined;
   const headerRow=values.filter((value,index)=>value && headerKey(value)===headerKey(HEADERS[index])).length>=3;
   const regionTitle=!declaredType&&!hasGold(receive)&&!hasGold(deliver)&&!hasPayment&&!quantity&&!unitWeight&&!totalWeight&&!price&&!labor&&!totalLabor
    && /^(SOGIAODICH|SOKHACHHANG|BANGGIAODICH|THANG\d|KHACHHANG|VUNGDULIEU)/.test(headerKey(rawDate||detail||note));
   if(headerRow || regionTitle || summary || numericSummary) {
    ignored.push({sheet:sheet.name,row:source.row,reason:headerRow||regionTitle?'Tiêu đề vùng dữ liệu mới':'Số dư / tổng kết'});
    resetRegion(source.row+1);lastRow=source.row;continue;
   }
   if(bulk && customer && currentCustomer && normalized(customer)!==currentCustomer) {
    resetRegion(source.row);date=context(0).trim();employee=context(bulk?3:2).trim();
    paymentDate=context(paymentColumn).trim();collector=context(HEADERS.indexOf('NGƯỜI THU')+(bulk?1:0)).trim();
   }
   if(customer)currentCustomer=normalized(customer);
   let dateError='';
   if(date) {
    try {currentDate=calendarDate(date);currentDateRow=rawDate.trim()?source.row:source.merged?.[0]?.master_row??source.row;}
    catch(error) {currentDate='';currentDateRow=undefined;dateError=(error as Error).message;}
   }
   if(excluded.has(JSON.stringify([sheet.name,source.row]))) {
    ignored.push({sheet:sheet.name,row:source.row,reason:'Người dùng chủ động bỏ qua'});
    parent=undefined;lastRow=source.row;continue;
   }
   const assignDate=(group:ImportGroup)=>{
    group.date_row=source.row;group.date_column=0;
    if(dateError)group.errors.push(dateError);
    else if(!currentDate)group.errors.push('Thiếu ngày giao dịch: chưa có ngày hợp lệ trong vùng dữ liệu này. Không tự lấy ngày hôm nay.');
    else {group.date=currentDate;group.date_inherited=!rawDate.trim();group.date_source_row=currentDateRow;}
   };
   if(!declaredType&&!hasGold(receive)&&!hasGold(deliver)&&!hasDetails&&!hasPayment&&note&&parent&&!rawDate&&!_rawEmployee&&(!bulk||!raw[1])) {
    parent.note=[parent.note,note].filter(Boolean).join('\n');parent.rows.push(source.row);lastRow=source.row;continue;
   }
   if(!declaredType&&!hasGold(receive)&&!hasGold(deliver)&&!hasDetails&&!hasPayment) {
    // Pure balance calculations do not erase the last business date. Unrelated text does.
    if((!date || dateError) && (note || _rawEmployee || rawDate || (bulk&&raw[1])))resetRegion(source.row+1);
    ignored.push({sheet:sheet.name,row:source.row,reason:'Không có nghiệp vụ'});parent=undefined;lastRow=source.row;continue;
   }
   lastRow=source.row;
   const safe=(g:ImportGroup,run:()=>void)=>{try{run()}catch(e){g.errors.push((e as Error).message)}};
   const kind=declaredType?resolveTransactionType(declaredType):undefined;
   if(kind)foundTransaction=true;
   // Only an explicit type starts a transaction. Gold columns never select the type.
   let primary:ImportGroup|undefined;
   if(declaredType) {
    parent=undefined;
    if(kind!=='PAYMENT') {
     primary=make(kind??'REVIEW',source.row,customer);parent=primary;
     primary.type_row=source.row;primary.declared_type=declaredType;
     primary.employee=employee;primary.note=note;
     assignDate(primary);
     if(!kind)primary.errors.push(`LOẠI GIAO DỊCH không hợp lệ: ${declaredType}`);
     else {
      const outgoing=GOLD_DEBT_SIGN[kind]===1;
      const expected=outgoing?deliver:receive;const other=outgoing?receive:deliver;
      safe(primary,()=>{primary!.gold=decimal(expected);if(units(primary!.gold)<=0n)throw Error(`Loại ${declaredType} cần số vàng dương ở cột ${outgoing?'GIAO (+)':'NHẬN (-)'}`)});
      if(hasGold(other))primary.errors.push(`Loại ${declaredType} chỉ dùng cột ${outgoing?'GIAO (+)':'NHẬN (-)'}, không đồng thời nhập cột ngược chiều`);
      if(kind==='RETURN_RECOVERED_GOLD')primary.errors.push('Khách trả vàng hồi cần trọng lượng thực và tuổi vàng để quy đổi theo backend. Mẫu này chưa có hai trường đó; không thể import chính xác, không tự coi là vàng thường.');
      if(kind==='RETURN_GOODS')primary.errors.push('Trả hàng cần phiếu giao nguồn, dòng hàng trả và thông tin hoàn tiền theo backend. Mẫu này chưa đủ liên kết; không thể import chính xác.');
      const plainGold=kind==='RETURN_GOLD'||kind==='GOLD_RETURN_TO_CUSTOMER';
      if(kind!=='DELIVERY'&&(hasProductFields||(!!detail&&!plainGold)))primary.errors.push('Loại giao dịch này không nhận chi tiết giao hàng / tiền công từ mẫu hiện tại; không tự bỏ dữ liệu chi tiết.');
     }
    } else if(hasGold(receive)||hasGold(deliver)||hasDetails) {
     primary=make('REVIEW',source.row,customer);primary.type_row=source.row;primary.declared_type=declaredType;
     parent=primary;assignDate(primary);
     primary.errors.push('Thu tiền công không được kèm số vàng hoặc chi tiết giao hàng; chọn đúng loại cho dòng hoặc tách nhóm.');
    }
   } else if(hasGold(receive)||hasGold(deliver)||(!parent&&(hasDetails||date||employee||customer))) {
    parent=undefined;
    primary=make('REVIEW',source.row,customer);parent=primary;primary.type_row=source.row;
    assignDate(primary);primary.employee=employee;primary.note=note;
    primary.errors.push('Thiếu LOẠI GIAO DỊCH ở dòng bắt đầu. Chọn loại trong xem trước; không suy đoán từ NHẬN (-) / GIAO (+).');
   }
   const delivery=primary;
   // The declared gold transaction owns narrative text; text alone is not a product line.
   const goldDescription=!!detail&&!hasProductFields&&parent
    && (parent.kind==='RETURN_GOLD'||parent.kind==='GOLD_RETURN_TO_CUSTOMER')
    && (primary===parent||(!declaredType&&!hasGold(receive)&&!hasGold(deliver)
     && (!date||(!dateError&&currentDate===parent.date))
     && (!customer||normalized(customer)===normalized(parent.customer))
     && (!employee||normalized(employee)===normalized(parent.employee))));
   if(goldDescription&&parent) {
    if(!parent.rows.includes(source.row))parent.rows.push(source.row);
    parent.note=[parent.note,detail===note?'':detail,!primary?note:''].filter(Boolean).join('\n');
   } else if(hasDetails) {
    // An explicitly different date/customer/employee is an ambiguous boundary, never inherited.
    if(parent && !primary && ((date && date!==parent.date && (()=>{try{return calendarDate(date)!==parent!.date}catch{return true}})()) || (customer && normalized(customer)!==normalized(parent.customer)) || (employee && normalized(employee)!==normalized(parent.employee)))) parent=undefined;
    if(parent && parent.kind!=='DELIVERY' && parent.kind!=='REVIEW' && !parent.errors.some(error=>error.includes('không nhận chi tiết')))
     parent.errors.push('Loại giao dịch này không nhận chi tiết giao hàng / tiền công từ mẫu hiện tại; không tự bỏ dữ liệu chi tiết.');
    if(!parent) { parent=make('REVIEW',source.row,customer);parent.type_row=source.row;parent.declared_type=declaredType;assignDate(parent);parent.errors.push('Chi tiết không có giao hàng cha rõ ràng. Chọn LOẠI GIAO DỊCH hoặc kiểm tra điểm tách và dòng nguồn.'); }
    if(!parent.rows.includes(source.row))parent.rows.push(source.row);
    if(detail||quantity||unitWeight||totalWeight||price||labor) safe(parent,()=>{
     if(!detail)throw Error(`Dòng ${source.row}: thiếu CHI TIẾT`);
     const q=Number(quantity);if(!/^\d+$/.test(quantity)||!Number.isSafeInteger(q)||q<=0||q>2147483647)throw Error(`Dòng ${source.row}: số lượng phải nguyên dương`);
     const unit=decimal(unitWeight);if(units(unit)<=0n)throw Error(`Dòng ${source.row}: trọng lượng đơn phải dương`);
     const line:ImportLine={row:source.row,name:detail,quantity:q,unit_weight_g:unit,total_weight_g:totalWeight?decimal(totalWeight):toDecimal(units(unit)*BigInt(q)),price:decimal(price),labor:labor?decimal(labor):''};
     if(units(line.total_weight_g)!==units(unit)*BigInt(q))parent!.errors.push(`Dòng ${source.row}: trọng lượng tổng khác số lượng × trọng lượng đơn`);
     const computed=(BigInt(q)*units(unit)*units(line.price)+75000n)/150000n;
     if(line.labor && units(line.labor)!==computed)parent!.errors.push(`Dòng ${source.row}: CÔNG khác công thức hiện có (giá công/15g, THB). Kiểm tra đơn vị/giá, không tự sửa.`);
     parent!.lines.push(line);
    });
    if(totalLabor)safe(parent,()=>{
     const value=decimal(totalLabor);
     if(parent!.labor && parent!.labor!==value)throw Error('Có nhiều TỔNG CÔNG khác nhau trong một nhóm');
     parent!.labor=value;
    });
    if(note && !delivery)parent.note=[parent.note,note].filter(Boolean).join('\n');
   }
   if(hasPayment || kind==='PAYMENT') {
    const g=make('PAYMENT',source.row,customer||parent?.customer||'');
    g.date_row=source.row;g.date_column=paymentColumn;
    safe(g,()=>{g.date=calendarDate(paymentDate);g.amount=decimal(amount);if(units(g.amount)<=0n)throw Error('Số tiền thu phải dương')});
    if(g.date&&!rawPaymentDate.trim()) {g.date_inherited=true;g.date_source_row=source.merged?.[paymentColumn]?.master_row;}
    g.collector=collector;g.note=note;g.parent=parent?.kind==='DELIVERY'?parent.id:undefined;
    if(kind==='PAYMENT'){g.type_row=source.row;g.declared_type=declaredType;}
    if((declaredType&&!kind)||(!declaredType&&!g.parent)) {
     g.type_row=source.row;g.declared_type=declaredType;
     g.errors.push('Khoản thu độc lập cần LOẠI GIAO DỊCH Thu tiền công; khoản thu trong nhóm cần giao hàng cha rõ ràng.');
    }
    if(kind==='PAYMENT'&&primary?.errors.length)g.errors.push(...primary.errors);
    if(!collector)g.errors.push('Thiếu NGƯỜI THU');
    if(!g.parent)g.warnings.push('Chọn rõ phiếu giao hàng được thanh toán; không tự gán vào phiếu trước.');
   }
  }
  for(const g of groups.filter(g=>g.sheet===sheet.name)) {
   if(g.note.length>1000)g.errors.push('Ghi chú của nhóm vượt 1.000 ký tự; cần sửa trước khi import');
   if(g.kind==='DELIVERY') {
    if(!g.lines.length)g.errors.push('Giao hàng chưa có chi tiết sản phẩm');
    if(g.gold && g.lines.length && g.lines.reduce((sum,l)=>sum+units(l.total_weight_g),0n)!==units(g.gold))g.errors.push('Tổng trọng lượng chi tiết không khớp GIAO (+). Cần kiểm tra, không tự bù số dư.');
    const sum=g.lines.reduce((s,l)=>s+(BigInt(l.quantity)*units(l.unit_weight_g)*units(l.price)+75000n)/150000n,0n);
    if(sum>99999999999999999999n||g.lines.reduce((s,l)=>s+units(l.total_weight_g),0n)>99999999999999999999n)g.errors.push('Tổng nhóm vượt giới hạn numeric(20,4) của hệ thống');
    if(g.labor && units(g.labor)!==sum)g.errors.push('TỔNG CÔNG không khớp tổng công chi tiết; không cộng hai lần CÔNG và TỔNG CÔNG.');
    if(!g.labor)g.labor=toDecimal(sum);
   }
   if(g.kind!=='PAYMENT'&&g.kind!=='REVIEW'&&!g.employee)g.warnings.push('Chọn nhân viên giao dịch đang hoạt động, có quyền báo giao.');
   g.content_hash=digest({kind:g.kind,customer:normalized(g.customer),date:g.date,employee:normalized(g.employee),gold:g.gold,lines:g.lines.map(({row:_row,...l})=>l),labor:g.labor,collector:normalized(g.collector),amount:g.amount,note:g.note});
  }
 }
 return {groups,ignored};
}
