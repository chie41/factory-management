import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { ExecutionTransaction } from './execution-transactions.js';
/** Physically removes only this logical operation's rows after business validation. */
export async function deleteTransactionRows(
  c: PoolClient,
  batch: string,
  t: ExecutionTransaction,
) {
  const materialCandidates = new Set<string>(),
    outputCandidates = new Set<string>();
  const addState = (s: Record<string, any>) => {
    if (s.physical_material_id) materialCandidates.add(s.physical_material_id);
    if (s.physical_output_id) outputCandidates.add(s.physical_output_id);
    for (const id of s.generated_material_ids ?? []) materialCandidates.add(id);
    if (s.generated_output_id) outputCandidates.add(s.generated_output_id);
  };
  addState(t.state);
  for (const change of t.changes) {
    addState(change.before_state);
    addState(change.after_state);
  }
  const materials = (
    await c.query(
      'SELECT * FROM batch_material_movements WHERE batch_id=$1 AND step_id=$2 AND employee_id=$3 AND (group_id=$4 OR id=ANY($5::uuid[])) FOR UPDATE',
      [batch, t.step_id, t.employee_id, t.id, [...materialCandidates]],
    )
  ).rows;
  if (
    materials.some((m) => m.material_type !== 'GOLD') ||
    (!t.has_gold && materials.length > 0)
  )
    throw new ConflictException(
      'Nghiệp vụ có nguyên liệu liên kết ngoài phạm vi vàng; cần xử lý nghiệp vụ liên quan trước khi xóa',
    );
  if (materials.some((m) => m.confirmed_by))
    throw new ConflictException(
      'Không xóa bút toán vàng đã xác nhận riêng; cần nghiệp vụ xử lý sổ vàng tương ứng',
    );
  const materialIds = materials.map((m) => m.id);
  if ([...materialCandidates].some((id) => !materialIds.includes(id)))
    throw new ConflictException(
      'Thiếu bản ghi vàng liên quan hoặc bản ghi không thuộc giao dịch; chưa thể xóa an toàn',
    );
  if (
    (
      await c.query(
        'SELECT 1 FROM batch_material_movements WHERE reverses_id=ANY($1::uuid[]) AND NOT(id=ANY($1::uuid[])) LIMIT 1',
        [materialIds],
      )
    ).rowCount
  )
    throw new ConflictException(
      'Bút toán vàng còn được một nghiệp vụ đảo khác tham chiếu; chưa thể xóa an toàn',
    );
  const outputs = (
    await c.query(
      'SELECT id FROM batch_outputs WHERE batch_id=$1 AND step_id=$2 AND id=ANY($3::uuid[]) FOR UPDATE',
      [batch, t.step_id, [...outputCandidates]],
    )
  ).rows;
  const outputIds = outputs.map((o) => o.id);
  if ([...outputCandidates].some((id) => !outputIds.includes(id)))
    throw new ConflictException(
      'Thiếu phiếu sản lượng liên quan hoặc phiếu không thuộc giao dịch; chưa thể xóa an toàn',
    );
  if (
    (
      await c.query(
        'SELECT 1 FROM batch_output_contributions WHERE output_id=ANY($1::uuid[]) AND assignment_id<>$2 LIMIT 1',
        [outputIds, t.assignment_id],
      )
    ).rowCount
  )
    throw new ConflictException(
      'Phiếu sản lượng còn thuộc nhân viên khác, không thể xóa một phần',
    );
  if (
    (
      await c.query(
        'SELECT 1 FROM batch_labor_entries WHERE output_id=ANY($1::uuid[]) LIMIT 1',
        [outputIds],
      )
    ).rowCount
  )
    throw new ConflictException(
      'Sản lượng đã có bút toán tiền công; cần xử lý bút toán liên quan trước',
    );
  const changeIds = t.changes.map((ch) => ch.id);
  const adjustments = (
    await c.query(
      'SELECT id,change_id FROM batch_output_adjustments WHERE output_id=ANY($1::uuid[]) OR change_id=ANY($2::uuid[]) FOR UPDATE',
      [outputIds, changeIds],
    )
  ).rows;
  if (adjustments.some((a) => !changeIds.includes(a.change_id)))
    throw new ConflictException(
      'Sản lượng còn được giao dịch điều chỉnh khác sử dụng',
    );
  const events = (
    await c.query(
      "SELECT id FROM batch_assignment_events WHERE assignment_id=$1 AND (id=$2 OR (after_state->>'transaction_adjustment'='true' AND after_state->>'related_transaction_id'=$3)) FOR UPDATE",
      [t.assignment_id, t.assignment_event_id, t.id],
    )
  ).rows;
  const scope = {
    batch_material_movements: materialIds,
    batch_outputs: outputIds,
    batch_output_contributions: outputIds,
    batch_output_adjustments: adjustments.map((a) => a.id),
    batch_assignment_events: events.map((e) => e.id),
    batch_transaction_changes: changeIds,
  };
  await c.query(
    "SELECT set_config('factory.production_delete_scope',$1,true)",
    [JSON.stringify(scope)],
  );
  try {
    await c.query(
      'DELETE FROM batch_output_adjustments WHERE id=ANY($1::uuid[])',
      [scope.batch_output_adjustments],
    );
    await c.query(
      'DELETE FROM batch_output_contributions WHERE output_id=ANY($1::uuid[])',
      [outputIds],
    );
    await c.query('DELETE FROM batch_outputs WHERE id=ANY($1::uuid[])', [
      outputIds,
    ]);
    await c.query(
      'DELETE FROM batch_material_movements WHERE id=ANY($1::uuid[])',
      [materialIds],
    );
    await c.query(
      'DELETE FROM batch_transaction_changes WHERE id=ANY($1::uuid[]) AND batch_id=$2',
      [changeIds, batch],
    );
    await c.query(
      'DELETE FROM batch_assignment_events WHERE id=ANY($1::uuid[]) AND assignment_id=$2',
      [scope.batch_assignment_events, t.assignment_id],
    );
  } catch (error) {
    if ((error as { code?: string }).code === '23503')
      throw new ConflictException(
        'Giao dịch vẫn còn dữ liệu phụ thuộc; không thể xóa an toàn. Không có dữ liệu nào bị xóa.',
      );
    throw error;
  }
  await c.query(
    "SELECT set_config('factory.production_delete_scope','{}',true)",
  );
  return {
    materials: materialIds.length,
    outputs: outputIds.length,
    assignment_events: events.length,
    changes: changeIds.length,
    output_adjustments: adjustments.length,
  };
}
