import type { PoolClient } from 'pg';
import { units, toDecimal } from '../customer-ledger/ledger-decimal.js';
import { storedMoneyUnits } from './grant-pricing.js';
type Row = Record<string, any>;
export type TransactionState = {
  quantity: number;
  completed_quantity: number;
  gold_weight_g: string;
  rate: string | null;
  currency: string;
  planned_labor: string | null;
  note: string;
  physical_material_id: string | null;
  physical_output_id: string | null;
  voided: boolean;
};
export type ExecutionTransaction = {
  id: string;
  assignment_id: string;
  step_id: string;
  employee_id: string;
  employee_name: string;
  occurred_at: string;
  kind: 'WORK' | 'ISSUE' | 'RECEIPT' | 'OUTPUT' | 'OTHER';
  has_work: boolean;
  has_gold: boolean;
  has_output: boolean;
  gold_kind: string | null;
  assignment_event_id: string | null;
  state: TransactionState;
  transaction_version: string;
  blocked_reason: string | null;
  changes: Row[];
};
export async function loadExecutionTransactions(
  c: Pick<PoolClient, 'query'>,
  batch: string,
) {
  const events = (
    await c.query(
      `SELECT h.*,a.step_id,a.employee_id,e.full_name employee_name,b.standard_weight_per_unit_g,s.labor_rate_per_15g,
 CASE WHEN h.quantity_delta>0 THEN round(h.quantity_delta::numeric*b.standard_weight_per_unit_g*COALESCE((h.after_state->>'applied_labor_rate_per_15g')::numeric,s.labor_rate_per_15g)/15,4)::text ELSE NULL END legacy_amount
 FROM batch_assignment_events h JOIN batch_assignments a ON a.id=h.assignment_id JOIN employees e ON e.id=a.employee_id JOIN production_batches b ON b.id=a.batch_id JOIN batch_steps s ON s.batch_id=a.batch_id AND s.step_id=a.step_id WHERE a.batch_id=$1 ORDER BY h.created_at,h.id`,
      [batch],
    )
  ).rows;
  const materials = (
    await c.query(
      `SELECT m.*,a.id assignment_id,e.full_name employee_name FROM batch_material_movements m JOIN batch_assignments a ON a.batch_id=m.batch_id AND a.step_id=m.step_id AND a.employee_id=m.employee_id JOIN employees e ON e.id=m.employee_id WHERE m.batch_id=$1 ORDER BY m.occurred_at,m.id`,
      [batch],
    )
  ).rows;
  const outputs = (
    await c.query(
      `SELECT o.*,pc.assignment_id,a.employee_id,e.full_name employee_name,pc.quantity contribution,(SELECT count(*)::int FROM batch_output_contributions x WHERE x.output_id=o.id) contributors FROM batch_outputs o JOIN batch_output_contributions pc ON pc.output_id=o.id JOIN batch_assignments a ON a.id=pc.assignment_id JOIN employees e ON e.id=a.employee_id WHERE o.batch_id=$1 ORDER BY o.occurred_at,o.id`,
      [batch],
    )
  ).rows;
  const changes = (
    await c.query(
      'SELECT t.*,u.username actor_name FROM batch_transaction_changes t JOIN users u ON u.id=t.actor_id WHERE batch_id=$1 ORDER BY created_at,id',
      [batch],
    )
  ).rows;
  const generatedMaterials = new Set<string>(),
    generatedOutputs = new Set<string>();
  for (const ch of changes) {
    for (const id of ch.after_state.generated_material_ids ?? [])
      generatedMaterials.add(id);
    if (ch.after_state.generated_output_id)
      generatedOutputs.add(ch.after_state.generated_output_id);
  }
  const map = new Map<string, ExecutionTransaction>();
  const base = (r: Row, id: string, at: string): ExecutionTransaction => ({
    id,
    assignment_id: r.assignment_id,
    step_id: r.step_id,
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    occurred_at: new Date(at).toISOString(),
    kind: 'OTHER',
    has_work: false,
    has_gold: false,
    has_output: false,
    gold_kind: null,
    assignment_event_id: null,
    state: {
      quantity: 0,
      completed_quantity: 0,
      gold_weight_g: '0',
      rate: null,
      currency: 'THB',
      planned_labor: '0',
      note: r.note ?? '',
      physical_material_id: null,
      physical_output_id: null,
      voided: false,
    },
    transaction_version: 'ORIGINAL',
    blocked_reason: null,
    changes: [],
  });
  for (const e of events) {
    if (e.after_state?.transaction_adjustment) continue;
    const id = e.after_state?.request_id ?? e.id,
      t = base(e, id, e.after_state?.assigned_at ?? e.created_at),
      g = e.after_state?.labor_grant;
    t.kind = 'WORK';
    t.has_work = true;
    t.assignment_event_id = e.id;
    t.state.quantity = e.quantity_delta;
    t.state.rate =
      g?.rate_per_15g ??
      e.after_state?.applied_labor_rate_per_15g ??
      e.labor_rate_per_15g;
    t.state.currency = g?.currency ?? 'THB';
    t.state.planned_labor = g?.planned_labor_delta ?? e.legacy_amount;
    t.state.note = e.after_state?.note ?? '';
    if (e.quantity_delta <= 0)
      t.blocked_reason =
        'Điều chỉnh phân công cũ không phải lượt giao sản phẩm độc lập';
    if (t.state.planned_labor == null)
      t.blocked_reason =
        'Lượt giao cũ thiếu snapshot đơn giá/trọng lượng để điều chỉnh an toàn';
    map.set(id, t);
  }
  for (const m of materials) {
    if (generatedMaterials.has(m.id)) continue;
    if (m.material_type !== 'GOLD') continue;
    const supported =
      m.effect === 1 &&
      [
        'INITIAL',
        'ADDITIONAL',
        'RETURN_TOTAL',
        'RETURN_UNUSED',
        'RECEIVE_PRODUCT',
      ].includes(m.kind);
    const id = supported ? m.group_id : m.id;
    let t = map.get(id);
    if (!t) {
      t = base(m, id, m.occurred_at);
      map.set(id, t);
    }
    if (
      m.material_type !== 'GOLD' ||
      ![
        'INITIAL',
        'ADDITIONAL',
        'RETURN_TOTAL',
        'RETURN_UNUSED',
        'RECEIVE_PRODUCT',
      ].includes(m.kind) ||
      m.effect !== 1
    ) {
      t.kind = t.has_work ? t.kind : 'OTHER';
      t.blocked_reason =
        'Bút toán chuyển/đảo hoặc nguyên liệu khác cần nghiệp vụ điều chỉnh riêng';
    }
    if (t.state.physical_material_id)
      t.blocked_reason =
        'Nhóm giao dịch có nhiều bút toán nguyên liệu, chưa hỗ trợ sửa chung';
    t.has_gold = true;
    t.gold_kind = m.kind;
    t.state.gold_weight_g = m.quantity;
    t.state.physical_material_id = m.id;
    if (!t.has_work && supported)
      t.kind = ['INITIAL', 'ADDITIONAL', 'TRANSFER_IN'].includes(m.kind)
        ? 'ISSUE'
        : 'RECEIPT';
    if (m.effect === -1) t.state.gold_weight_g = toDecimal(-units(m.quantity));
    if (m.confirmed_by)
      t.blocked_reason =
        'Bút toán vàng đã được xác nhận riêng; chưa có cơ chế đảo sổ vàng đã chốt';
    if (
      materials.some((x) => x.reverses_id === m.id) &&
      !changes.some((ch) => ch.before_state.physical_material_id === m.id)
    )
      t.blocked_reason =
        'Bút toán vàng đã đảo bằng nghiệp vụ cũ; cần xử lý chuỗi đảo trước';
  }
  for (const o of outputs) {
    if (generatedOutputs.has(o.id)) continue;
    const id =
      /^GOLD-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        o.work_reference,
      )
        ? o.work_reference.slice(5)
        : o.id;
    let t = map.get(id);
    if (!t) {
      t = base(o, id, o.occurred_at);
      t.kind = 'OUTPUT';
      map.set(id, t);
    }
    t.has_output = true;
    t.state.completed_quantity = o.contribution;
    t.state.physical_output_id = o.id;
    if (o.contributors !== 1)
      t.blocked_reason =
        'Phiếu sản lượng nhiều người đóng góp cần nghiệp vụ điều chỉnh riêng';
  }
  for (const t of map.values()) {
    t.changes = changes.filter((ch) => ch.transaction_id === t.id);
    const last = t.changes.at(-1);
    if (last) {
      t.state = last.after_state;
      t.has_output = t.has_output || t.state.physical_output_id != null;
      t.transaction_version = last.id;
    }
  }
  return {
    transactions: [...map.values()],
    generatedMaterials,
    generatedOutputs,
    materials,
  };
}
/** Check the full economic chain at original event times, not reversal posting times. */
export function assertTransactionChain(
  transactions: ExecutionTransaction[],
  assignment: string,
) {
  let assigned = 0,
    done = 0,
    issued = 0n,
    received = 0n;
  const points: {
    id: string;
    assigned: number;
    done: number;
    goldDeficit: bigint;
  }[] = [];
  for (const t of transactions
    .filter((t) => t.assignment_id === assignment)
    .sort(
      (a, b) =>
        Date.parse(a.occurred_at) - Date.parse(b.occurred_at) ||
        a.id.localeCompare(b.id),
    )) {
    if (!t.state.voided) {
      assigned += t.state.quantity;
      done += t.state.completed_quantity;
      const gold = t.state.gold_weight_g;
      const amount = gold.startsWith('-')
        ? -storedMoneyUnits(gold.slice(1))
        : storedMoneyUnits(gold);
      if (t.has_gold) {
        if (
          ['INITIAL', 'ADDITIONAL', 'TRANSFER_IN'].includes(t.gold_kind ?? '')
        )
          issued += amount;
        else received += amount;
      }
    }
    points.push({
      id: t.id,
      assigned,
      done,
      goldDeficit: received > issued ? received - issued : 0n,
    });
  }
  return points;
}
