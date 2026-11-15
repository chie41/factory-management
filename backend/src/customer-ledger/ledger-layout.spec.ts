import { describe, it, expect, vi } from 'vitest';
import { LedgerLayoutService } from './ledger-layout.service.js';
import type { RbacService } from '../auth/rbac.service.js';
function fixture(fail = false) {
 const query = vi.fn(async (sql: string) => {
  if (sql.startsWith('UPDATE') && fail) throw new Error('offline');
  return { rows: [] };
 });
 const release = vi.fn();
 const service = new LedgerLayoutService({pool:{connect:async()=>({query,release})}} as unknown as RbacService);
 vi.spyOn(service,'read').mockResolvedValue({revision:'4',items:[{id:'a'},{id:'b'}]});
 return {service,query,release};
}
const items = [{id:'b',is_visible_in_ledger:false},{id:'a',is_visible_in_ledger:true}];
describe('ledger customer layout atomic save',()=>{
 it('commits order and visibility together under a row lock',async()=>{
  const {service,query,release}=fixture();
  await service.save({revision:'4',items});
  expect(query.mock.calls.map(c=>c[0])).toEqual(['BEGIN','INSERT INTO public.ledger_customer_layout(id) VALUES(true) ON CONFLICT DO NOTHING','SELECT id FROM public.ledger_customer_layout WHERE id=true FOR UPDATE','UPDATE public.ledger_customer_layout SET items=$1::jsonb,revision=revision+1 WHERE id=true','COMMIT']);
  expect(release).toHaveBeenCalled();
 });
 it.each([
  {revision:'3',items},
  {revision:'4',items:[items[0],items[0]]},
  {revision:'4',items:[items[0]]},
  {revision:'4',items:[...items,{id:'c',is_visible_in_ledger:true}]},
 ])('rejects stale revisions and incomplete or duplicate customer sets',async dto=>{
  const {service,query}=fixture();
  await expect(service.save(dto)).rejects.toThrow();
  expect(query.mock.calls.map(c=>c[0])).not.toContain('COMMIT');
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');
 });
 it('rolls back a failed write and releases the client',async()=>{
  const {service,query,release}=fixture(true);
  await expect(service.save({revision:'4',items})).rejects.toThrow('offline');
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  expect(release).toHaveBeenCalled();
 });
});

describe('ledger layout defaults do not mask schema failures',()=>{
 it('returns revision zero for no customers and no singleton',async()=>{
  const service=new LedgerLayoutService({pool:{query:vi.fn().mockResolvedValue({rows:[]})}} as unknown as RbacService);
  expect(await service.read()).toEqual({revision:'0',items:[]});
 });
 it('preserves the revision for an empty customer list',async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{revision:'7'}]});
  const service=new LedgerLayoutService({pool:{query}} as unknown as RbacService);
  expect(await service.read()).toEqual({revision:'7',items:[]});
 });
 it('propagates missing-table errors instead of inventing fallback data',async()=>{
  const error=Object.assign(new Error('relation does not exist'),{code:'42P01'});
  const service=new LedgerLayoutService({pool:{query:vi.fn().mockRejectedValue(error)}} as unknown as RbacService);
  await expect(service.read()).rejects.toBe(error);
 });
});
