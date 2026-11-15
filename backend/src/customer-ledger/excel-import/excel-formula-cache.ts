import { BadRequestException } from '@nestjs/common';
import { posix } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export type ExcelZipEntry = { method:number; compressed:number; expanded:number; localOffset:number };

/** ExcelJS drops cached empty strings on shared formulas. Read that fact from OOXML,
 * without evaluating formulas or treating a genuinely missing cached result as blank. */
export function emptyFormulaResults(buffer:Buffer,entries:Map<string,ExcelZipEntry>):Map<number,Set<string>> {
 const xml=(name:string):string=>{
  const entry=entries.get(name);
  if(!entry)return '';
  const offset=entry.localOffset;
  if(offset+30>buffer.length||buffer.readUInt32LE(offset)!==0x04034b50)throw new BadRequestException('Header ZIP của Excel không hợp lệ');
  const start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
  if(start+entry.compressed>buffer.length)throw new BadRequestException('Dữ liệu ZIP của Excel không đầy đủ');
  const data=buffer.subarray(start,start+entry.compressed);
  const output=entry.method===0?data:entry.method===8?inflateRawSync(data,{maxOutputLength:Math.max(1,entry.expanded+1)}):undefined;
  if(!output||output.length!==entry.expanded)throw new BadRequestException('Không đọc được dữ liệu XML của Excel');
  return output.toString('utf8');
 };
 const attributes=(text:string):Record<string,string>=>Object.fromEntries(
  [...text.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)].map(match=>[match[1],match[3]]),
 );
 const relationships=new Map<string,string>();
 for(const match of xml('xl/_rels/workbook.xml.rels').matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/g)) {
  const attrs=attributes(match[1]);
  if(attrs.Id&&attrs.Target&&attrs.TargetMode!=='External')relationships.set(attrs.Id,attrs.Target);
 }
 const result=new Map<number,Set<string>>();
 for(const match of xml('xl/workbook.xml').matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)\/?\s*>/g)) {
  const attrs=attributes(match[1]);const target=relationships.get(attrs['r:id']);
  if(!target)continue;
  const name=posix.normalize(target.startsWith('/')?target.slice(1):`xl/${target}`);
  const empty=new Set<string>();
  for(const cell of xml(name).matchAll(/<(?:[\w.-]+:)?c\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?c\s*>/g)) {
   const cellAttrs=attributes(cell[1]);
   if(cellAttrs.t==='str'&&cellAttrs.r&&/<(?:[\w.-]+:)?f\b/.test(cell[2])
    && /<(?:[\w.-]+:)?v\b[^>]*(?:\/\s*>|>\s*<\/(?:[\w.-]+:)?v\s*>)/.test(cell[2]))empty.add(cellAttrs.r);
  }
  result.set(Number(attrs.sheetId),empty);
 }
 return result;
}
