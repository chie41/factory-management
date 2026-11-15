import { deleteTransactionRows } from './execution-transaction-delete.js';
import {
  loadExecutionTransactions,
  assertTransactionChain,
  type TransactionState,
} from './execution-transactions.js';
import {
  plannedGrant,
  storedMoneyUnits,
  type GrantPricing,
} from './grant-pricing.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { RbacService } from '../auth/rbac.service.js';
import { units, toDecimal } from '../customer-ledger/ledger-decimal.js';
import {
  ExecutionRequestDto,
  StageActionDto,
  AssignmentDto,
  OutputDto,
  MaterialDto,
  MaterialTransferDto,
  MaterialReverseDto,
  LossDto,
  LaborDto,
  MaterialIdentityDto,
  ReconcileDto,
  WorkGoldDto,
  TransactionChangeDto,
  GoldReceiptDto,
} from './execution.dto.js';
type Row = Record<string, any>;
type Db = Pick<PoolClient, 'query'>;
@Injectable()
export class ExecutionService {
  constructor(private readonly rbac: RbacService) {}
  changeTransaction(
    batch: string,
    id: string,
    action: 'EDIT' | 'DELETE',
    dto: TransactionChangeDto,
    actor: string,
  ) {
    return this.mutate(
      batch,
      null,
      actor,
      'production.adjustments.manage',
      'transaction.' + action.toLowerCase(),
      dto,
      async (c) => {
        const loaded = await loadExecutionTransactions(c, batch),
          t = loaded.transactions.find((t) => t.id === id);
        if (!t) throw new NotFoundException('Không tìm thấy giao dịch');
        if (t.state.voided && action !== 'DELETE')
          throw new ConflictException(
            'Giao dịch đã hủy, không được sửa/xóa lại',
          );
        if (t.transaction_version !== dto.transaction_version)
          throw new ConflictException(
            'Giao dịch đã thay đổi, tải lại dữ liệu trước khi thao tác',
          );
        if (t.blocked_reason) throw new ConflictException(t.blocked_reason);
        const a = await this.assigned(batch, t.step_id, t.employee_id, c),
          stage = await this.stage(batch, t.step_id, c),
          b = await this.batch(batch, c);
        await this.accountOpen(a.id, c);
        if (t.has_work)
          await this.rbac.require(actor, ['production.assignments.manage'], c);
        if (t.has_gold)
          await this.rbac.require(actor, ['production.materials.manage'], c);
        if (t.has_output || (dto.completed_quantity ?? 0) > 0)
          await this.rbac.require(actor, ['production.output.manage'], c);
        if (
          (
            await c.query(
              'SELECT 1 FROM batch_labor_entries WHERE batch_id=$1 AND step_id=$2 AND employee_id=$3 LIMIT 1',
              [batch, t.step_id, t.employee_id],
            )
          ).rowCount
        )
          throw new ConflictException(
            'Nhân viên/công đoạn đã có bút toán tiền công thực tế; cần nghiệp vụ đảo tiền công riêng trước khi sửa/xóa',
          );
        const before = structuredClone(t.state),
          after: TransactionState = { ...before };
        if (action === 'DELETE') {
          after.voided = true;
          after.quantity = 0;
          after.completed_quantity = 0;
          after.gold_weight_g = '0';
          after.planned_labor = '0';
        } else {
          if (dto.quantity != null && !t.has_work)
            throw new BadRequestException(
              'Giao dịch này không có lượt giao việc',
            );
          if (dto.gold_weight_g != null && !t.has_gold)
            throw new BadRequestException('Giao dịch này không có phần vàng');
          if (
            dto.completed_quantity != null &&
            !t.has_output &&
            t.kind !== 'RECEIPT'
          )
            throw new BadRequestException('Giao dịch này không nhận sản lượng');
          after.quantity = t.has_work ? (dto.quantity ?? before.quantity) : 0;
          after.gold_weight_g = t.has_gold
            ? (dto.gold_weight_g ?? before.gold_weight_g)
            : '0';
          after.completed_quantity =
            t.has_output || t.kind === 'RECEIPT'
              ? (dto.completed_quantity ?? before.completed_quantity)
              : 0;
          const workChanged =
            t.has_work &&
            ((dto.quantity != null && dto.quantity !== before.quantity) ||
              (dto.currency != null && dto.currency !== before.currency) ||
              (dto.labor_rate_per_15g != null &&
                (before.rate == null ||
                  units(dto.labor_rate_per_15g) !== units(before.rate))) ||
              (dto.planned_labor != null &&
                (before.planned_labor == null ||
                  storedMoneyUnits(dto.planned_labor) !==
                    storedMoneyUnits(before.planned_labor))));
          if (workChanged) {
            after.currency = dto.currency ?? before.currency;
            if (after.quantity > 0) {
              const p = plannedGrant(
                b.standard_weight_per_unit_g,
                after.quantity,
                {
                  rate: dto.labor_rate_per_15g ?? before.rate ?? undefined,
                  currency: after.currency,
                  amount: dto.planned_labor,
                  mode: dto.pricing_mode,
                },
                before.rate,
              );
              after.rate = p.rate;
              after.planned_labor = p.amount;
            } else after.planned_labor = '0';
          }
          if (
            after.quantity === 0 &&
            after.completed_quantity === 0 &&
            units(after.gold_weight_g) === 0n
          )
            throw new BadRequestException(
              'Giao dịch rỗng; sử dụng Xóa giao dịch',
            );
        }
        const qDelta = after.quantity - before.quantity,
          outDelta = after.completed_quantity - before.completed_quantity;
        if (
          qDelta !== 0 &&
          (
            await c.query(
              "SELECT 1 FROM batch_assignment_events WHERE assignment_id=$1 AND kind='SET' AND created_at>(SELECT created_at FROM batch_assignment_events WHERE id=$2) AND NOT COALESCE((after_state->>'transaction_adjustment')::boolean,false) AND before_state IS NOT NULL AND before_state<>'null'::jsonb LIMIT 1",
              [a.id, t.assignment_event_id],
            )
          ).rowCount
        )
          throw new ConflictException(
            'Có lần điều chỉnh tổng phân công SET ở phía sau; cần xác định lại các lượt giao phụ thuộc trước khi thay đổi số lượng',
          );
        const done = (
          await c.query(
            'SELECT COALESCE(sum(quantity),0)::int n FROM batch_effective_output_contributions WHERE assignment_id=$1',
            [a.id],
          )
        ).rows[0].n;
        const assigned = (a.planned_quantity ?? 0) + qDelta;
        if (assigned < 0 || done + outDelta < 0 || done + outDelta > assigned)
          throw new ConflictException(
            'Số lượng hoàn thành sẽ vượt số đã giao hoặc âm; cần xử lý các lần nhận sản phẩm phụ thuộc trước',
          );
        const other = (
          await c.query(
            'SELECT COALESCE(sum(planned_quantity),0)::bigint::text n FROM batch_assignments WHERE batch_id=$1 AND step_id=$2 AND id<>$3',
            [batch, t.step_id, a.id],
          )
        ).rows[0].n;
        if (BigInt(other) + BigInt(assigned) > BigInt(b.planned_quantity))
          throw new ConflictException(
            'Vượt số sản phẩm còn có thể phân công của công đoạn',
          );
        if (
          stage.completed_quantity + outDelta < 0 ||
          stage.completed_quantity + outDelta > b.planned_quantity
        )
          throw new ConflictException('Sản lượng công đoạn không hợp lệ');
        if (outDelta < 0) {
          const dependent = (
            await c.query(
              "SELECT s.name FROM batch_step_dependencies d JOIN batch_steps s ON s.batch_id=d.batch_id AND s.step_id=d.step_id WHERE d.batch_id=$1 AND d.depends_on_id=$2 AND (s.execution_started_at IS NOT NULL OR s.execution_status<>'NOT_STARTED') LIMIT 1",
              [batch, t.step_id],
            )
          ).rows[0];
          if (stage.execution_status === 'COMPLETED' || dependent)
            throw new ConflictException(
              'Không giảm sản lượng của công đoạn đã hoàn thành hoặc đã có công đoạn phụ thuộc thực hiện; trạng thái được giữ nguyên',
            );
        }
        if (outDelta > 0 && stage.execution_status !== 'IN_PROGRESS')
          throw new ConflictException(
            'Chỉ bổ sung sản lượng khi công đoạn đang thực hiện',
          );
        const beforeChain = assertTransactionChain(loaded.transactions, a.id);
        const simulated = loaded.transactions.map((x) =>
          x.id === t.id ? { ...x, state: after } : x,
        );
        const afterChain = assertTransactionChain(simulated, a.id);
        for (let i = 0; i < afterChain.length; i++) {
          const p = afterChain[i],
            old = beforeChain[i];
          if (p.assigned < 0 || p.done < 0 || p.done > p.assigned)
            throw new ConflictException(
              'Thay đổi làm một lần nhận sản phẩm trong chuỗi vượt số lượng đã giao tại thời điểm đó',
            );
          if (p.goldDeficit > old.goldDeficit)
            throw new ConflictException(
              'Thay đổi làm vàng nhận vượt vàng giao hoặc tăng chênh lệch trong chuỗi; cần xử lý giao dịch nhận phụ thuộc trước',
            );
        }
        let totals: Record<string, string> | undefined,
          currentRate =
            a.applied_labor_rate_per_15g ?? stage.labor_rate_per_15g,
          currentCurrency = 'THB';
        if (t.has_work) {
          const latest = (
            await c.query(
              "SELECT after_state->'labor_grant' p FROM batch_assignment_events WHERE assignment_id=$1 AND after_state ? 'labor_grant' ORDER BY created_at DESC,id DESC LIMIT 1",
              [a.id],
            )
          ).rows[0]?.p;
          const legacy = (
            await c.query(
              'SELECT round($1::numeric*$2::numeric*$3::numeric/15,4)::text n',
              [a.planned_quantity, b.standard_weight_per_unit_g, currentRate],
            )
          ).rows[0].n;
          totals = latest?.labor_totals
            ? { ...latest.labor_totals }
            : { THB: latest?.planned_labor_total ?? legacy };
          if (
            before.planned_labor == null ||
            Object.values(totals!).some((x) => x == null)
          )
            throw new ConflictException(
              'Thiếu snapshot tiền công để điều chỉnh an toàn',
            );
          const old =
            storedMoneyUnits(totals![before.currency] ?? '0') -
            storedMoneyUnits(before.planned_labor);
          if (old < 0n)
            throw new ConflictException(
              'Snapshot tổng tiền công không khớp lượt giao gốc',
            );
          totals![before.currency] = toDecimal(old);
          totals![after.currency] = toDecimal(
            storedMoneyUnits(totals![after.currency] ?? '0') +
              storedMoneyUnits(after.planned_labor ?? '0'),
          );
          const latestWork = simulated
            .filter(
              (x) =>
                x.assignment_id === a.id &&
                x.has_work &&
                !x.state.voided &&
                x.state.quantity > 0,
            )
            .sort(
              (x, y) =>
                Date.parse(x.occurred_at) - Date.parse(y.occurred_at) ||
                x.id.localeCompare(y.id),
            )
            .at(-1);
          currentRate = latestWork?.state.rate ?? stage.labor_rate_per_15g;
          currentCurrency = latestWork?.state.currency ?? 'THB';
        }
        await c.query(
          'UPDATE batch_assignments SET planned_quantity=$2,applied_labor_rate_per_15g=$3,updated_by=$4,updated_at=clock_timestamp() WHERE id=$1',
          [
            a.id,
            assigned,
            t.has_work ? currentRate : a.applied_labor_rate_per_15g,
            actor,
          ],
        );
        if (action === 'DELETE') {
          const removed = await deleteTransactionRows(c, batch, t);
          if (outDelta !== 0)
            await c.query(
              'UPDATE batch_steps SET completed_quantity=completed_quantity+$3 WHERE batch_id=$1 AND step_id=$2',
              [batch, t.step_id, outDelta],
            );
          if (t.has_work) {
            const keys = Object.keys(totals!);
            // Internal balance checkpoint: no operational transaction or deleted-root link.
            const grant = {
              rate_per_15g: currentRate,
              currency: currentCurrency,
              labor_totals: totals,
              planned_labor_total: keys.length === 1 ? totals![keys[0]] : null,
              planned_labor_delta: '0',
              mixed_rates: true,
            };
            await c.query(
              "INSERT INTO batch_assignment_events(assignment_id,quantity_delta,resulting_quantity,kind,before_state,after_state,actor_id) VALUES($1,0,$2,'SET',NULL,$3::jsonb,$4)",
              [
                a.id,
                assigned,
                JSON.stringify({
                  ...a,
                  planned_quantity: assigned,
                  applied_labor_rate_per_15g: currentRate,
                  transaction_adjustment: true,
                  deletion_checkpoint: true,
                  labor_grant: grant,
                }),
                actor,
              ],
            );
          }
          await this.validBalances(batch, c);
          return { transaction_id: t.id, deleted: true, before, removed };
        }
        const changeId = randomUUID(),
          generatedMaterialIds: string[] = [];
        if (
          t.has_gold &&
          units(after.gold_weight_g) !== units(before.gold_weight_g)
        ) {
          if (before.physical_material_id) {
            const m = (
              await c.query(
                'SELECT * FROM batch_material_movements WHERE id=$1 AND batch_id=$2',
                [before.physical_material_id, batch],
              )
            ).rows[0];
            if (
              !m ||
              m.confirmed_by ||
              (
                await c.query(
                  'SELECT 1 FROM batch_material_movements WHERE reverses_id=$1',
                  [m.id],
                )
              ).rowCount
            )
              throw new ConflictException(
                'Bút toán vàng đã xác nhận hoặc đã đảo; cần xử lý chuỗi bút toán trước',
              );
            const reverse = await this.movement(
              c,
              batch,
              t.step_id,
              t.employee_id,
              m,
              m.quantity,
              m.kind,
              new Date().toISOString(),
              dto.reason,
              actor,
              randomUUID(),
              -1,
              m.id,
            );
            generatedMaterialIds.push(reverse.id);
          }
          after.physical_material_id = null;
          if (units(after.gold_weight_g) > 0n) {
            const m = await this.movement(
              c,
              batch,
              t.step_id,
              t.employee_id,
              { material_type: 'GOLD', material_name: 'Vàng', unit: 'G' },
              after.gold_weight_g,
              t.gold_kind!,
              t.occurred_at,
              before.note,
              actor,
              randomUUID(),
            );
            after.physical_material_id = m.id;
            generatedMaterialIds.push(m.id);
          }
        }
        let generatedOutputId: string | undefined;
        if (!before.physical_output_id && after.completed_quantity > 0) {
          const o = await this.outputIn(
            batch,
            t.step_id,
            {
              request_id: dto.request_id,
              version: dto.version,
              assignment_ids: [a.id],
              quantity: after.completed_quantity,
              work_reference: 'GOLD-' + t.id,
              occurred_at: t.occurred_at,
              note: before.note,
            },
            actor,
            c,
          );
          after.physical_output_id = o.id;
          generatedOutputId = o.id;
        }
        await c.query(
          'INSERT INTO batch_transaction_changes(id,batch_id,transaction_id,assignment_id,action,before_state,after_state,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)',
          [
            changeId,
            batch,
            t.id,
            a.id,
            action,
            JSON.stringify(before),
            JSON.stringify({
              ...after,
              generated_material_ids: generatedMaterialIds,
              generated_output_id: generatedOutputId,
            }),
            dto.reason.trim(),
            actor,
          ],
        );
        if (before.physical_output_id && outDelta !== 0) {
          await c.query(
            'INSERT INTO batch_output_adjustments(output_id,assignment_id,quantity_delta,change_id,actor_id) VALUES($1,$2,$3,$4,$5)',
            [before.physical_output_id, a.id, outDelta, changeId, actor],
          );
          await c.query(
            'UPDATE batch_steps SET completed_quantity=completed_quantity+$3 WHERE batch_id=$1 AND step_id=$2',
            [batch, t.step_id, outDelta],
          );
        }
        if (t.has_work) {
          const keys = Object.keys(totals!);
          const grant = {
            rate_per_15g: currentRate,
            currency: currentCurrency,
            labor_totals: totals,
            planned_labor_total: keys.length === 1 ? totals![keys[0]] : null,
            planned_labor_delta: '0',
            mixed_rates: true,
          };
          await c.query(
            "INSERT INTO batch_assignment_events(assignment_id,quantity_delta,resulting_quantity,kind,before_state,after_state,actor_id) VALUES($1,$2,$3,'SET',$4::jsonb,$5::jsonb,$6)",
            [
              a.id,
              qDelta,
              assigned,
              JSON.stringify(a),
              JSON.stringify({
                ...a,
                planned_quantity: assigned,
                transaction_adjustment: true,
                related_transaction_id: t.id,
                labor_grant: grant,
              }),
              actor,
            ],
          );
        }
        await this.validBalances(batch, c);
        return {
          transaction_id: t.id,
          change_id: changeId,
          before,
          after,
          reason: dto.reason,
        };
      },
    );
  }
  issueWork(batch: string, step: string, dto: WorkGoldDto, actor: string) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.assignments.manage',
      'work.issue',
      dto,
      async (c) => {
        const gold = units(dto.gold_weight_g),
          at = new Date().toISOString();
        if (gold > 0n)
          await this.rbac.require(actor, ['production.materials.manage'], c);
        if (gold === 0n && dto.quantity === 0)
          throw new BadRequestException(
            'Nhập vàng giao hoặc số sản phẩm giao thêm',
          );
        await this.employee(dto.employee_id, c);
        let assignment: unknown;
        if (dto.quantity > 0) {
          assignment = await this.assignIn(
            batch,
            step,
            {
              request_id: dto.request_id,
              version: dto.version,
              quantity_mode: 'ADD',
              employee_id: dto.employee_id,
              planned_quantity: dto.quantity,
              status: 'ACTIVE',
              assigned_at: at,
              note: dto.note,
            },
            actor,
            c,
            {
              rate: dto.labor_rate_per_15g,
              currency: dto.currency,
              amount: dto.planned_labor,
              mode: dto.pricing_mode,
            },
          );
        } else {
          if (dto.planned_labor != null && units(dto.planned_labor) !== 0n)
            throw new BadRequestException(
              'Chỉ giao vàng không được phát sinh tiền công',
            );
          const existing = (
            await c.query(
              'SELECT * FROM batch_assignments WHERE batch_id=$1 AND step_id=$2 AND employee_id=$3',
              [batch, step, dto.employee_id],
            )
          ).rows[0];
          if (existing) {
            await this.accountOpen(existing.id, c);
            assignment = existing;
          } else {
            const target = await this.stage(batch, step, c);
            if (target.execution_status === 'COMPLETED')
              throw new ConflictException(
                'Không tạo người nhận mới khi công đoạn đã hoàn thành',
              );
            assignment = (
              await c.query(
                `INSERT INTO batch_assignments(batch_id,step_id,employee_id,planned_quantity,assigned_at,status,note,created_by,updated_by) VALUES($1,$2,$3,0,$4,'ACTIVE',$5,$6,$6) RETURNING *`,
                [batch, step, dto.employee_id, at, dto.note ?? null, actor],
              )
            ).rows[0];
          }
        }
        const previous = (
          await c.query(
            "SELECT 1 FROM batch_material_movements WHERE batch_id=$1 AND step_id=$2 AND employee_id=$3 AND material_type='GOLD' AND kind IN ('INITIAL','ADDITIONAL') LIMIT 1",
            [batch, step, dto.employee_id],
          )
        ).rowCount;
        const movement =
          gold > 0n
            ? await this.materialMovementIn(
                batch,
                step,
                {
                  request_id: dto.request_id,
                  version: dto.version,
                  employee_id: dto.employee_id,
                  material: {
                    material_type: 'GOLD',
                    material_name: 'Vàng',
                    unit: 'G',
                  },
                  quantity: dto.gold_weight_g,
                  kind: previous ? 'ADDITIONAL' : 'INITIAL',
                  occurred_at: at,
                  note: dto.note,
                },
                actor,
                c,
              )
            : null;
        return { assignment, gold_movement: movement };
      },
    );
  }
  recordGold(batch: string, step: string, dto: GoldReceiptDto, actor: string) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.materials.manage',
      'gold.record',
      dto,
      async (c) => {
        const gold = units(dto.gold_weight_g),
          at = new Date().toISOString();
        await this.employee(dto.employee_id, c);
        const assignment = await this.assigned(batch, step, dto.employee_id, c);
        await this.accountOpen(assignment.id, c);
        if (
          dto.mode === 'ADDITIONAL' &&
          (gold <= 0n || dto.completed_quantity !== 0)
        )
          throw new BadRequestException(
            'Giao bổ sung cần trọng lượng dương và không ghi sản lượng hoàn thành',
          );
        if (gold === 0n && dto.completed_quantity === 0)
          throw new BadRequestException('Nhập trọng lượng hoặc sản lượng nhận');
        const movement =
          gold > 0n
            ? await this.materialMovementIn(
                batch,
                step,
                {
                  request_id: dto.request_id,
                  version: dto.version,
                  employee_id: dto.employee_id,
                  material: {
                    material_type: 'GOLD',
                    material_name: 'Vàng',
                    unit: 'G',
                  },
                  quantity: dto.gold_weight_g,
                  kind:
                    dto.mode === 'ADDITIONAL' ? 'ADDITIONAL' : 'RETURN_TOTAL',
                  occurred_at: at,
                  note: dto.note,
                },
                actor,
                c,
              )
            : null;
        let output = null;
        if (dto.completed_quantity > 0) {
          await this.rbac.require(actor, ['production.output.manage'], c);
          output = await this.outputIn(
            batch,
            step,
            {
              request_id: dto.request_id,
              version: dto.version,
              work_reference: 'GOLD-' + dto.request_id,
              quantity: dto.completed_quantity,
              assignment_ids: [assignment.id],
              occurred_at: at,
              note: dto.note,
            },
            actor,
            c,
          );
        }
        return {
          gold_movement: movement,
          output,
          assignment_id: assignment.id,
        };
      },
    );
  }
  private async accountOpen(assignmentId: string, c: Db) {
    if (
      (
        await c.query(
          "SELECT 1 FROM batch_worker_reconciliations WHERE assignment_id=$1 AND status='CLOSED'",
          [assignmentId],
        )
      ).rowCount
    )
      throw new ConflictException(
        'Đối soát đã chốt. Mở lại và nhập lý do trước khi điều chỉnh.',
      );
  }
  private async goldTotals(assignment: Row, c: Db) {
    return (
      await c.query(
        `SELECT COALESCE(sum(CASE WHEN kind IN ('INITIAL','ADDITIONAL','TRANSFER_IN') THEN effect*quantity ELSE 0 END),0)::text issued,COALESCE(sum(CASE WHEN kind IN ('RETURN_UNUSED','RETURN_TOTAL','RECEIVE_PRODUCT','TRANSFER_OUT') THEN effect*quantity ELSE 0 END),0)::text received FROM batch_material_movements WHERE batch_id=$1 AND step_id=$2 AND employee_id=$3 AND material_type='GOLD'`,
        [assignment.batch_id, assignment.step_id, assignment.employee_id],
      )
    ).rows[0];
  }
  reconcile(batch: string, step: string, dto: ReconcileDto, actor: string) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.reconciliation.manage',
      'reconciliation.' + dto.action.toLowerCase(),
      dto,
      async (c) => {
        const assignment = await this.assigned(batch, step, dto.employee_id, c),
          before =
            (
              await c.query(
                'SELECT * FROM batch_worker_reconciliations WHERE assignment_id=$1',
                [assignment.id],
              )
            ).rows[0] ?? null;
        if (dto.action === 'REOPEN') {
          if (before?.status !== 'CLOSED')
            throw new ConflictException('Chỉ mở lại đối soát đang chốt');
          const after = (
            await c.query(
              "UPDATE batch_worker_reconciliations SET status='ADJUSTING',updated_at=clock_timestamp() WHERE assignment_id=$1 RETURNING *",
              [assignment.id],
            )
          ).rows[0];
          await c.query(
            "INSERT INTO batch_reconciliation_events(assignment_id,action,reason,before_state,after_state,actor_id) VALUES($1,'REOPEN',$2,$3::jsonb,$4::jsonb,$5)",
            [
              assignment.id,
              dto.reason,
              JSON.stringify(before),
              JSON.stringify(after),
              actor,
            ],
          );
          return { before, after, reason: dto.reason };
        }
        if (before?.status === 'CLOSED')
          throw new ConflictException('Đối soát đã chốt');
        const done = (
          await c.query(
            'SELECT COALESCE(sum(quantity),0)::int quantity FROM batch_effective_output_contributions WHERE assignment_id=$1',
            [assignment.id],
          )
        ).rows[0].quantity;
        if (
          assignment.planned_quantity == null ||
          done !== assignment.planned_quantity
        )
          throw new ConflictException(
            'Nhân viên phải hoàn thành đủ tổng số lượng giao trước khi chốt',
          );
        if (!dto.materials_reviewed)
          throw new BadRequestException(
            'Quản lý phải xác nhận đã đối soát nguyên liệu',
          );
        const gold = await this.goldTotals(assignment, c);
        const after = (
          await c.query(
            "INSERT INTO batch_worker_reconciliations(assignment_id,status,issued_gold_g,received_gold_g,difference_gold_g,closed_by,closed_at) VALUES($1,'CLOSED',$2,$3,$3::numeric-$2::numeric,$4,clock_timestamp()) ON CONFLICT(assignment_id) DO UPDATE SET status='CLOSED',issued_gold_g=EXCLUDED.issued_gold_g,received_gold_g=EXCLUDED.received_gold_g,difference_gold_g=EXCLUDED.difference_gold_g,closed_by=EXCLUDED.closed_by,closed_at=EXCLUDED.closed_at,updated_at=clock_timestamp() RETURNING *",
            [assignment.id, gold.issued, gold.received, actor],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO batch_reconciliation_events(assignment_id,action,reason,before_state,after_state,actor_id) VALUES($1,'CLOSE',$2,$3::jsonb,$4::jsonb,$5)",
          [
            assignment.id,
            dto.reason,
            JSON.stringify(before),
            JSON.stringify({
              ...after,
              completed_quantity: done,
              assigned_quantity: assignment.planned_quantity,
            }),
            actor,
          ],
        );
        return { before, after, reason: dto.reason };
      },
    );
  }
  private async batch(id: string, c: Db) {
    const row = (
      await c.query('SELECT * FROM production_batches WHERE id=$1', [id])
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy lô');
    return row;
  }
  private async stage(batch: string, id: string, c: Db) {
    const row = (
      await c.query(
        'SELECT * FROM batch_steps WHERE batch_id=$1 AND step_id=$2',
        [batch, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy công đoạn của lô');
    return row;
  }
  private async employee(id: string, c: Db) {
    if (
      !(
        await c.query(
          "SELECT 1 FROM employees WHERE id=$1 AND deleted_at IS NULL AND status='ACTIVE'",
          [id],
        )
      ).rowCount
    )
      throw new BadRequestException('Chọn nhân viên đang hoạt động');
  }
  private async assigned(batch: string, step: string, employee: string, c: Db) {
    const row = (
      await c.query(
        'SELECT * FROM batch_assignments WHERE batch_id=$1 AND step_id=$2 AND employee_id=$3',
        [batch, step, employee],
      )
    ).rows[0];
    if (!row)
      throw new BadRequestException(
        'Nhân viên chưa được phân công ở công đoạn này',
      );
    return row;
  }
  private material(material: MaterialIdentityDto) {
    if (
      ['GOLD', 'SILVER'].includes(material.material_type) &&
      material.unit !== 'G'
    )
      throw new BadRequestException('Vàng/bạc sử dụng đơn vị gram');
    return { ...material, material_name: material.material_name.trim() };
  }
  private async mutate(
    batchId: string,
    stepId: string | null,
    actor: string,
    permission: string,
    kind: string,
    dto: ExecutionRequestDto,
    work: (c: PoolClient) => Promise<unknown>,
  ) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:production'))",
      );
      await this.rbac.require(actor, [permission], c);
      const intent = this.rbac.version({ batchId, stepId, kind, dto });
      const old = (
        await c.query(
          'SELECT * FROM batch_execution_requests WHERE request_id=$1',
          [dto.request_id],
        )
      ).rows[0];
      if (old) {
        if (
          old.batch_id !== batchId ||
          old.actor_id !== actor ||
          old.intent_hash !== intent
        )
          throw new ConflictException(
            'Mã yêu cầu đã được dùng cho nội dung khác',
          );
        await c.query('COMMIT');
        return { data: old.result };
      }
      const batch = await this.batch(batchId, c);
      this.rbac.checkVersion(
        dto.version,
        this.rbac.version({ id: batch.id, revision: batch.revision }),
      );
      if (['COMPLETED', 'CANCELLED'].includes(batch.status))
        throw new ConflictException(
          'Lô đã đóng, chưa có quy tắc mở lại/điều chỉnh lô đã đóng',
        );
      const before = stepId ? await this.stage(batchId, stepId, c) : null;
      const result = await work(c);
      if (stepId)
        await c.query(
          'UPDATE batch_steps SET execution_locked_at=COALESCE(execution_locked_at,clock_timestamp()) WHERE batch_id=$1 AND step_id=$2',
          [batchId, stepId],
        );
      const changed = (
        await c.query(
          'UPDATE production_batches SET revision=revision+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$1 RETURNING revision',
          [batchId, actor],
        )
      ).rows[0];
      const data = {
        result,
        version: this.rbac.version({ id: batchId, revision: changed.revision }),
      };
      await c.query(
        'INSERT INTO batch_audit_events(batch_id,action,before_state,after_state,actor_id) VALUES($1,$2,$3::jsonb,$4::jsonb,$5)',
        [
          batchId,
          'execution.' + kind,
          JSON.stringify(before),
          JSON.stringify({ step_id: stepId, ...data }),
          actor,
        ],
      );
      await c.query(
        'INSERT INTO batch_execution_requests(request_id,batch_id,actor_id,intent_hash,result) VALUES($1,$2,$3,$4,$5::jsonb)',
        [dto.request_id, batchId, actor, intent, JSON.stringify(data)],
      );
      await c.query('COMMIT');
      return { data };
    } catch (e) {
      await c.query('ROLLBACK');
      if ((e as { code?: string }).code === '23505')
        throw new ConflictException(
          'Mã sản lượng/nhân viên/bút toán đã tồn tại. Không ghi nhận trùng.',
        );
      throw e;
    } finally {
      c.release();
    }
  }
  private async waiting(batch: string, step: string, c: Db) {
    return (
      await c.query(
        "SELECT p.step_id,p.name,p.execution_status FROM batch_step_dependencies d JOIN batch_steps p ON p.batch_id=d.batch_id AND p.step_id=d.depends_on_id WHERE d.batch_id=$1 AND d.step_id=$2 AND p.execution_status<>'COMPLETED' ORDER BY p.display_order",
        [batch, step],
      )
    ).rows;
  }
  stageAction(batch: string, step: string, dto: StageActionDto, actor: string) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.execution.manage',
      'stage.' + dto.action.toLowerCase(),
      dto,
      async (c) => {
        const current = await this.stage(batch, step, c);
        const transitions: Record<string, string[]> = {
          START: ['NOT_STARTED'],
          PAUSE: ['IN_PROGRESS'],
          RESUME: ['PAUSED'],
          COMPLETE: ['IN_PROGRESS'],
        };
        if (!transitions[dto.action].includes(current.execution_status))
          throw new ConflictException(
            'Trạng thái công đoạn không cho phép thao tác này',
          );
        if (['START', 'RESUME'].includes(dto.action)) {
          const waiting = await this.waiting(batch, step, c);
          if (waiting.length)
            throw new ConflictException(
              'Chưa thể bắt đầu, đang chờ: ' +
                waiting.map((row) => row.name).join(', '),
            );
        }
        if (dto.action === 'COMPLETE') {
          const planned = await this.batch(batch, c);
          if (current.completed_quantity !== planned.planned_quantity)
            throw new ConflictException(
              'Chưa có quy tắc hoàn thành thiếu sản lượng. Chỉ xác nhận hoàn thành khi đủ số lượng dự kiến.',
            );
          const checks = (
            await c.query(
              'SELECT a.id,a.employee_id,a.planned_quantity,r.status,COALESCE((SELECT sum(quantity) FROM batch_effective_output_contributions WHERE assignment_id=a.id),0)::int done FROM batch_assignments a LEFT JOIN batch_worker_reconciliations r ON r.assignment_id=a.id WHERE a.batch_id=$1 AND a.step_id=$2',
              [batch, step],
            )
          ).rows;
          if (
            checks.reduce(
              (sum, a) => sum + Number(a.planned_quantity ?? 0),
              0,
            ) > planned.planned_quantity
          )
            throw new ConflictException(
              'Phân công cũ đang vượt số lượng lô; cần xử lý dữ liệu trước khi hoàn thành',
            );
          if (
            !checks.length ||
            checks.some(
              (a) =>
                a.planned_quantity == null ||
                a.done !== a.planned_quantity ||
                a.status !== 'CLOSED',
            )
          )
            throw new ConflictException(
              'Tất cả nhân viên phải đủ số lượng được giao và đã chốt đối soát trước khi hoàn thành công đoạn',
            );
        }
        const status = {
          START: 'IN_PROGRESS',
          RESUME: 'IN_PROGRESS',
          PAUSE: 'PAUSED',
          COMPLETE: 'COMPLETED',
        }[dto.action];
        await c.query(
          "UPDATE batch_steps SET execution_status=$3,execution_started_at=CASE WHEN $3='IN_PROGRESS' THEN COALESCE(execution_started_at,clock_timestamp()) ELSE execution_started_at END,execution_finished_at=CASE WHEN $3='COMPLETED' THEN clock_timestamp() ELSE execution_finished_at END WHERE batch_id=$1 AND step_id=$2",
          [batch, step, status],
        );
        if (dto.action === 'START')
          await c.query(
            'UPDATE production_batches SET actual_start=COALESCE(actual_start,clock_timestamp()) WHERE id=$1',
            [batch],
          );
        return { ...(await this.stage(batch, step, c)), reason: dto.reason };
      },
    );
  }
  private async assignIn(
    batch: string,
    step: string,
    dto: AssignmentDto,
    actor: string,
    c: PoolClient,
    pricingInput?: GrantPricing,
  ) {
    const target = await this.stage(batch, step, c),
      b = await this.batch(batch, c);
    if (
      dto.quantity_mode === 'ADD' &&
      (dto.planned_quantity == null || dto.planned_quantity <= 0)
    )
      throw new BadRequestException('Số lượng giao thêm phải dương');
    const before = (
      await c.query(
        'SELECT * FROM batch_assignments WHERE batch_id=$1 AND step_id=$2 AND employee_id=$3',
        [batch, step, dto.employee_id],
      )
    ).rows[0];
    if (!before || dto.status === 'ACTIVE')
      await this.employee(dto.employee_id, c);
    if (before) await this.accountOpen(before.id, c);
    const quantity =
      dto.quantity_mode === 'ADD'
        ? (before?.planned_quantity ?? 0) + (dto.planned_quantity ?? 0)
        : dto.planned_quantity;
    if (quantity == null || quantity < 1)
      throw new BadRequestException('Nhập số lượng giao dương');
    const completed = before
      ? (
          await c.query(
            'SELECT COALESCE(sum(quantity),0)::int quantity FROM batch_effective_output_contributions WHERE assignment_id=$1',
            [before.id],
          )
        ).rows[0].quantity
      : 0;
    const others = (
      await c.query(
        'SELECT COALESCE(sum(planned_quantity),0)::bigint::text quantity FROM batch_assignments WHERE batch_id=$1 AND step_id=$2 AND employee_id<>$3',
        [batch, step, dto.employee_id],
      )
    ).rows[0].quantity;
    if (
      quantity < completed ||
      BigInt(others) + BigInt(quantity) > BigInt(b.planned_quantity)
    )
      throw new ConflictException(
        'Số lượng giao không được nhỏ hơn số đã xong hoặc làm tổng phân công vượt số lượng của công đoạn',
      );
    if (
      target.execution_status === 'COMPLETED' &&
      quantity !== (before?.planned_quantity ?? 0)
    )
      throw new ConflictException(
        'Chưa có quy tắc giao thêm việc sau khi công đoạn hoàn thành',
      );
    let rate =
      pricingInput?.rate ??
      before?.applied_labor_rate_per_15g ??
      target.labor_rate_per_15g;
    if (pricingInput != null && b.standard_weight_per_unit_g == null)
      throw new ConflictException(
        'Mẫu mã của lô chưa có trọng lượng chuẩn để tính tiền công',
      );
    const previousPricing = (
      await c.query(
        "SELECT after_state->'labor_grant' pricing FROM batch_assignment_events WHERE assignment_id=$1 AND after_state ? 'labor_grant' ORDER BY created_at DESC,id DESC LIMIT 1",
        [before?.id ?? null],
      )
    ).rows[0]?.pricing;
    const delta = quantity - (before?.planned_quantity ?? 0);
    // A reduction across several rates needs an explicit choice of which grant to reverse.
    // Do not silently reprice old grants through the legacy SET endpoint.
    if (delta < 0 && previousPricing?.mixed_rates)
      throw new ConflictException(
        'Phân công đã có nhiều đơn giá; cần quy tắc xác định lần giao được giảm trước khi điều chỉnh số lượng',
      );
    const oldRate =
      before?.applied_labor_rate_per_15g ?? target.labor_rate_per_15g;
    const currency =
      pricingInput?.currency ?? previousPricing?.currency ?? 'THB';
    let mixedRates =
      !!previousPricing?.mixed_rates ||
      (delta > 0 &&
        (before?.planned_quantity ?? 0) > 0 &&
        rate != null &&
        oldRate != null &&
        (units(String(rate)) !== units(String(oldRate)) ||
          currency !== (previousPricing?.currency ?? 'THB')));
    const legacyBase = (
      await c.query(
        'SELECT round($1::numeric*$2::numeric*$3::numeric/15,4)::text total',
        [before?.planned_quantity ?? 0, b.standard_weight_per_unit_g, oldRate],
      )
    ).rows[0].total;
    const totals: Record<string, string> = previousPricing?.labor_totals
      ? { ...previousPricing.labor_totals }
      : (before?.planned_quantity ?? 0) > 0
        ? { THB: previousPricing?.planned_labor_total ?? legacyBase }
        : {};
    if (Object.values(totals).some((value) => value == null) && pricingInput)
      throw new ConflictException(
        'Phân công cũ thiếu dữ liệu tiền công; cần bổ sung lịch sử trước khi giao thêm',
      );
    if (delta < 0 && Object.keys(totals).length > 1)
      throw new ConflictException(
        'Cần chỉ định lượt giao để giảm số lượng khi có nhiều tiền tệ',
      );
    let deltaAmount: string | null = null;
    if (delta > 0 && pricingInput) {
      const calculated = plannedGrant(
        b.standard_weight_per_unit_g,
        delta,
        pricingInput,
        oldRate,
      );
      rate = calculated.rate;
      deltaAmount = calculated.amount;
      if (
        (before?.planned_quantity ?? 0) > 0 &&
        oldRate != null &&
        units(rate) !== units(oldRate)
      )
        mixedRates = true;
    } else if (delta !== 0) {
      deltaAmount = (
        await c.query(
          'SELECT round($1::numeric*$2::numeric*$3::numeric/15,0)::text amount',
          [Math.abs(delta), b.standard_weight_per_unit_g, rate],
        )
      ).rows[0].amount;
    } else deltaAmount = '0';
    if (
      deltaAmount != null &&
      !Object.values(totals).some((value) => value == null)
    ) {
      const total =
        storedMoneyUnits(totals[currency] ?? '0') +
        (delta < 0 ? -1n : 1n) * storedMoneyUnits(deltaAmount);
      if (total < 0n)
        throw new ConflictException('Điều chỉnh làm âm tiền công dự kiến');
      totals[currency] = toDecimal(total);
    }
    const currencies = Object.keys(totals);
    const pricing = {
      delta_total: deltaAmount,
      total: currencies.length === 1 ? totals[currencies[0]] : null,
    };
    const row = (
      await c.query(
        `INSERT INTO batch_assignments(batch_id,step_id,employee_id,planned_quantity,assigned_at,status,note,created_by,updated_by,applied_labor_rate_per_15g) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)
        ON CONFLICT(batch_id,step_id,employee_id) DO UPDATE SET planned_quantity=EXCLUDED.planned_quantity,assigned_at=EXCLUDED.assigned_at,status=EXCLUDED.status,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp(),applied_labor_rate_per_15g=COALESCE(EXCLUDED.applied_labor_rate_per_15g,batch_assignments.applied_labor_rate_per_15g) RETURNING *`,
        [
          batch,
          step,
          dto.employee_id,
          quantity,
          dto.assigned_at,
          dto.status,
          dto.note ?? null,
          actor,
          rate,
        ],
      )
    ).rows[0];
    await c.query(
      'INSERT INTO batch_assignment_events(assignment_id,quantity_delta,resulting_quantity,kind,before_state,after_state,actor_id) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)',
      [
        row.id,
        quantity - (before?.planned_quantity ?? 0),
        quantity,
        dto.quantity_mode,
        JSON.stringify(before ?? null),
        JSON.stringify({
          ...row,
          request_id: dto.request_id,
          labor_grant: {
            quantity_delta: delta,
            rate_per_15g: rate,
            standard_weight_per_unit_g: b.standard_weight_per_unit_g,
            planned_labor_delta: pricing.delta_total,
            planned_labor_total: pricing.total,
            mixed_rates: mixedRates,
            currency,
            labor_totals: totals,
            pricing_mode: pricingInput?.mode ?? 'RATE',
          },
        }),
        actor,
      ],
    );
    return { before: before ?? null, after: row };
  }
  assign(batch: string, step: string, dto: AssignmentDto, actor: string) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.assignments.manage',
      'assignment.save',
      dto,
      (c) => this.assignIn(batch, step, dto, actor, c),
    );
  }

  private async outputIn(
    batch: string,
    step: string,
    dto: OutputDto,
    actor: string,
    c: PoolClient,
  ) {
    const target = await this.stage(batch, step, c),
      b = await this.batch(batch, c);
    if (target.execution_status !== 'IN_PROGRESS')
      throw new ConflictException(
        'Chỉ ghi sản lượng khi công đoạn đang thực hiện',
      );
    if (target.completed_quantity + dto.quantity > b.planned_quantity)
      throw new ConflictException(
        'Sản lượng vượt số lượng dự kiến của công đoạn',
      );
    if (dto.assignment_ids.length !== 1)
      throw new BadRequestException(
        'Mỗi phiếu sản lượng v2 phải gắn với đúng một nhân viên',
      );
    for (const id of dto.assignment_ids) {
      const assignment = (
        await c.query(
          "SELECT * FROM batch_assignments WHERE id=$1 AND batch_id=$2 AND step_id=$3 AND status='ACTIVE'",
          [id, batch, step],
        )
      ).rows[0];
      if (!assignment)
        throw new BadRequestException(
          'Phân công không hợp lệ/không còn hoạt động',
        );
      await this.accountOpen(id, c);
      const credited = (
        await c.query(
          'SELECT COALESCE(sum(quantity),0)::int quantity FROM batch_effective_output_contributions WHERE assignment_id=$1',
          [id],
        )
      ).rows[0].quantity;
      if (
        assignment.planned_quantity != null &&
        credited + dto.quantity > assignment.planned_quantity
      )
        throw new ConflictException(
          'Sản lượng tham gia vượt số lượng giao cho một nhân viên',
        );
    }
    const row = (
      await c.query(
        'INSERT INTO batch_outputs(batch_id,step_id,work_reference,quantity,occurred_at,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          batch,
          step,
          dto.work_reference.trim(),
          dto.quantity,
          dto.occurred_at,
          dto.note ?? null,
          actor,
        ],
      )
    ).rows[0];
    for (const id of dto.assignment_ids)
      await c.query(
        'INSERT INTO batch_output_contributions(output_id,assignment_id,quantity) VALUES($1,$2,$3)',
        [row.id, id, dto.quantity],
      );
    await c.query(
      'UPDATE batch_steps SET completed_quantity=completed_quantity+$3 WHERE batch_id=$1 AND step_id=$2',
      [batch, step, dto.quantity],
    );
    return { ...row, assignment_ids: dto.assignment_ids };
  }
  output(batch: string, step: string, dto: OutputDto, actor: string) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.output.manage',
      'output.record',
      dto,
      (c) => this.outputIn(batch, step, dto, actor, c),
    );
  }
  private async balances(batch: string, c: Db) {
    return (
      await c.query(
        `WITH movements AS (
  SELECT batch_id,step_id,employee_id,material_type,material_name,unit,
   sum(CASE WHEN kind='INITIAL' THEN effect*quantity ELSE 0 END) initial,
   sum(CASE WHEN kind='ADDITIONAL' THEN effect*quantity ELSE 0 END) additional,
   sum(CASE WHEN kind IN ('RETURN_UNUSED','RETURN_TOTAL') THEN effect*quantity ELSE 0 END) returned,
   sum(CASE WHEN kind='RECEIVE_PRODUCT' THEN effect*quantity ELSE 0 END) products,
   sum(CASE WHEN kind='TRANSFER_IN' THEN effect*quantity ELSE 0 END) transfer_in,
   sum(CASE WHEN kind='TRANSFER_OUT' THEN effect*quantity ELSE 0 END) transfer_out
  FROM batch_material_movements WHERE batch_id=$1 GROUP BY batch_id,step_id,employee_id,material_type,material_name,unit
 ),losses AS (SELECT batch_id,step_id,employee_id,material_type,material_name,unit,sum(CASE WHEN direction='INCREASE' THEN quantity ELSE -quantity END) recognized_loss FROM batch_loss_entries WHERE batch_id=$1 GROUP BY batch_id,step_id,employee_id,material_type,material_name,unit),
 keys AS (SELECT batch_id,step_id,employee_id,material_type,material_name,unit FROM movements UNION SELECT batch_id,step_id,employee_id,material_type,material_name,unit FROM losses)
 SELECT k.*,s.name step_name,e.full_name employee_name,COALESCE(m.initial,0)::text initial,COALESCE(m.additional,0)::text additional,COALESCE(m.returned,0)::text returned,COALESCE(m.products,0)::text products,COALESCE(m.transfer_in,0)::text transfer_in,COALESCE(m.transfer_out,0)::text transfer_out,COALESCE(l.recognized_loss,0)::text recognized_loss,
 (COALESCE(m.initial,0)+COALESCE(m.additional,0)+COALESCE(m.transfer_in,0)-COALESCE(m.returned,0)-COALESCE(m.products,0)-COALESCE(m.transfer_out,0))::text unreturned,
 (COALESCE(m.initial,0)+COALESCE(m.additional,0)+COALESCE(m.transfer_in,0)-COALESCE(m.returned,0)-COALESCE(m.products,0)-COALESCE(m.transfer_out,0)-COALESCE(l.recognized_loss,0))::text unexplained
 FROM keys k LEFT JOIN movements m USING(batch_id,step_id,employee_id,material_type,material_name,unit) LEFT JOIN losses l USING(batch_id,step_id,employee_id,material_type,material_name,unit) JOIN batch_steps s ON s.batch_id=k.batch_id AND s.step_id=k.step_id JOIN employees e ON e.id=k.employee_id ORDER BY s.display_order,e.full_name,k.material_type,k.material_name`,
        [batch],
      )
    ).rows;
  }
  private async validBalances(batch: string, c: Db) {
    for (const row of await this.balances(batch, c)) {
      if (row.material_type === 'GOLD') continue;
      if (
        row.unreturned.startsWith('-') ||
        row.unexplained.startsWith('-') ||
        row.recognized_loss.startsWith('-')
      )
        throw new ConflictException(
          'Bút toán làm âm số dư nguyên liệu/hao hụt. Nếu thu hồi phần đã xác định hao hụt, ghi giảm hao hụt trước rồi ghi nhận nguyên liệu trả về.',
        );
    }
  }
  private async movement(
    c: Db,
    batch: string,
    step: string,
    employee: string,
    material: MaterialIdentityDto,
    quantity: string,
    kind: string,
    at: string,
    note: string | null,
    actor: string,
    group: string,
    effect = 1,
    reverses: string | null = null,
  ) {
    return (
      await c.query(
        'INSERT INTO batch_material_movements(batch_id,step_id,employee_id,material_type,material_name,unit,quantity,kind,occurred_at,note,created_by,group_id,effect,reverses_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
        [
          batch,
          step,
          employee,
          material.material_type,
          material.material_name,
          material.unit,
          quantity,
          kind,
          at,
          note,
          actor,
          group,
          effect,
          reverses,
        ],
      )
    ).rows[0];
  }
  private async materialMovementIn(
    batch: string,
    step: string,
    dto: MaterialDto,
    actor: string,
    c: PoolClient,
  ) {
    const material = this.material(dto.material);
    if (units(dto.quantity) <= 0n)
      throw new BadRequestException('Số lượng phải dương');
    const assignment = await this.assigned(batch, step, dto.employee_id, c);
    await this.accountOpen(assignment.id, c);
    if (dto.kind === 'RETURN_TOTAL' && material.material_type !== 'GOLD')
      throw new BadRequestException('Nhận vàng tổng chỉ áp dụng cho vàng');
    const row = await this.movement(
      c,
      batch,
      step,
      dto.employee_id,
      material,
      dto.quantity,
      dto.kind,
      dto.occurred_at,
      dto.note ?? null,
      actor,
      dto.request_id,
    );
    await this.validBalances(batch, c);
    return row;
  }
  materialMovement(
    batch: string,
    step: string,
    dto: MaterialDto,
    actor: string,
  ) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.materials.manage',
      'material.record',
      dto,
      (c) => this.materialMovementIn(batch, step, dto, actor, c),
    );
  }
  transfer(
    batch: string,
    step: string,
    dto: MaterialTransferDto,
    actor: string,
  ) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.materials.manage',
      'material.transfer',
      dto,
      async (c) => {
        const material = this.material(dto.material);
        if (units(dto.quantity) <= 0n)
          throw new BadRequestException('Số lượng phải dương');
        if (step === dto.to_step_id && dto.employee_id === dto.to_employee_id)
          throw new BadRequestException('Nguồn và đích chuyển giống nhau');
        await this.stage(batch, dto.to_step_id, c);
        if (
          dto.to_step_id !== step &&
          (await this.stage(batch, step, c)).execution_status !== 'COMPLETED'
        )
          throw new ConflictException(
            'Chưa có quy tắc chuyển bán thành phẩm từng phần khi công đoạn nguồn chưa hoàn thành',
          );
        const from = await this.assigned(batch, step, dto.employee_id, c),
          to = await this.assigned(
            batch,
            dto.to_step_id,
            dto.to_employee_id,
            c,
          );
        await this.accountOpen(from.id, c);
        await this.accountOpen(to.id, c);
        const group = randomUUID();
        const source = await this.movement(
            c,
            batch,
            step,
            dto.employee_id,
            material,
            dto.quantity,
            'TRANSFER_OUT',
            dto.occurred_at,
            dto.note ?? null,
            actor,
            group,
          ),
          destination = await this.movement(
            c,
            batch,
            dto.to_step_id,
            dto.to_employee_id,
            material,
            dto.quantity,
            'TRANSFER_IN',
            dto.occurred_at,
            dto.note ?? null,
            actor,
            group,
          );
        await c.query(
          'UPDATE batch_steps SET execution_locked_at=COALESCE(execution_locked_at,clock_timestamp()) WHERE batch_id=$1 AND step_id=$2',
          [batch, dto.to_step_id],
        );
        await this.validBalances(batch, c);
        return { source, destination };
      },
    );
  }
  reverse(batch: string, dto: MaterialReverseDto, actor: string) {
    return this.mutate(
      batch,
      null,
      actor,
      'production.adjustments.manage',
      'material.reverse',
      dto,
      async (c) => {
        const source = (
          await c.query(
            'SELECT * FROM batch_material_movements WHERE id=$1 AND batch_id=$2 AND effect=1',
            [dto.movement_id, batch],
          )
        ).rows[0];
        if (!source)
          throw new BadRequestException('Không tìm thấy bút toán gốc');
        const logical = await loadExecutionTransactions(c, batch);
        if (
          logical.transactions.some(
            (t) =>
              t.kind !== 'OTHER' &&
              (t.state.physical_material_id === source.id ||
                t.changes.some(
                  (ch) => ch.before_state.physical_material_id === source.id,
                )),
          )
        )
          throw new ConflictException(
            'Sử dụng Sửa/Xóa giao dịch để xử lý đầy đủ nghiệp vụ liên quan, không đảo riêng một phần',
          );
        const originals = (
          await c.query(
            'SELECT * FROM batch_material_movements WHERE group_id=$1 AND batch_id=$2 AND effect=1',
            [source.group_id, batch],
          )
        ).rows;
        const group = randomUUID(),
          rows: Row[] = [];
        for (const row of originals) {
          const assignment = await this.assigned(
            batch,
            row.step_id,
            row.employee_id,
            c,
          );
          await this.accountOpen(assignment.id, c);
          rows.push(
            await this.movement(
              c,
              batch,
              row.step_id,
              row.employee_id,
              row,
              row.quantity,
              row.kind,
              new Date().toISOString(),
              dto.reason,
              actor,
              group,
              -1,
              row.id,
            ),
          );
        }
        await this.validBalances(batch, c);
        return rows;
      },
    );
  }
  loss(batch: string, step: string, dto: LossDto, actor: string) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.losses.manage',
      'loss.record',
      dto,
      async (c) => {
        const material = this.material(dto.material);
        if (material.material_type === 'GOLD')
          throw new BadRequestException(
            'Vàng sử dụng chốt đối soát Hao/Heo; không ghi hao vàng riêng trong phiên bản v2',
          );
        if (units(dto.quantity) <= 0n)
          throw new BadRequestException('Hao hụt phải dương');
        await this.assigned(batch, step, dto.employee_id, c);
        if (dto.direction === 'DECREASE' && !dto.adjusts_id)
          throw new BadRequestException(
            'Chọn bút toán hao hụt gốc để điều chỉnh',
          );
        if (dto.adjusts_id) {
          const root = (
            await c.query(
              "SELECT * FROM batch_loss_entries WHERE id=$1 AND batch_id=$2 AND step_id=$3 AND employee_id=$4 AND direction='INCREASE'",
              [dto.adjusts_id, batch, step, dto.employee_id],
            )
          ).rows[0];
          if (
            !root ||
            root.material_type !== material.material_type ||
            root.material_name !== material.material_name ||
            root.unit !== material.unit
          )
            throw new BadRequestException('Bút toán hao hụt gốc không khớp');
          if (dto.direction === 'DECREASE') {
            const used = (
              await c.query(
                "SELECT COALESCE(sum(quantity),0)::text quantity FROM batch_loss_entries WHERE adjusts_id=$1 AND direction='DECREASE'",
                [root.id],
              )
            ).rows[0].quantity;
            if (units(used) + units(dto.quantity) > units(root.quantity))
              throw new ConflictException('Giảm vượt hao hụt của bút toán gốc');
          }
        }
        const row = (
          await c.query(
            'INSERT INTO batch_loss_entries(batch_id,step_id,employee_id,material_type,material_name,unit,quantity,direction,adjusts_id,occurred_at,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
            [
              batch,
              step,
              dto.employee_id,
              material.material_type,
              material.material_name,
              material.unit,
              dto.quantity,
              dto.direction,
              dto.adjusts_id ?? null,
              dto.occurred_at,
              dto.reason,
              actor,
            ],
          )
        ).rows[0];
        await this.validBalances(batch, c);
        return row;
      },
    );
  }
  labor(batch: string, step: string, dto: LaborDto, actor: string) {
    return this.mutate(
      batch,
      step,
      actor,
      'production.labor.manage',
      'labor.record',
      dto,
      async (c) => {
        await this.assigned(batch, step, dto.employee_id, c);
        const amount = toDecimal(
          ((units(dto.amount) + 5000n) / 10000n) * 10000n,
        );
        if (
          dto.output_id &&
          !(
            await c.query(
              'SELECT 1 FROM batch_outputs o JOIN batch_effective_output_contributions pc ON pc.output_id=o.id JOIN batch_assignments a ON a.id=pc.assignment_id WHERE o.id=$1 AND o.batch_id=$2 AND o.step_id=$3 AND a.employee_id=$4 AND pc.quantity>0',
              [dto.output_id, batch, step, dto.employee_id],
            )
          ).rowCount
        )
          throw new BadRequestException(
            'Sản lượng không thuộc nhân viên/công đoạn',
          );
        if (dto.direction === 'DECREASE' && !dto.adjusts_id)
          throw new BadRequestException('Chọn tiền công gốc để điều chỉnh');
        if (dto.adjusts_id) {
          const root = (
            await c.query(
              "SELECT * FROM batch_labor_entries WHERE id=$1 AND batch_id=$2 AND step_id=$3 AND employee_id=$4 AND direction='INCREASE'",
              [dto.adjusts_id, batch, step, dto.employee_id],
            )
          ).rows[0];
          if (!root) throw new BadRequestException('Tiền công gốc không khớp');
          if (dto.direction === 'DECREASE') {
            const used = (
              await c.query(
                "SELECT COALESCE(sum(amount),0)::text quantity FROM batch_labor_entries WHERE adjusts_id=$1 AND direction='DECREASE'",
                [root.id],
              )
            ).rows[0].quantity;
            if (units(used) + units(amount) > units(root.amount))
              throw new ConflictException(
                'Giảm vượt tiền công của bút toán gốc',
              );
          }
        }
        return (
          await c.query(
            'INSERT INTO batch_labor_entries(batch_id,step_id,employee_id,output_id,amount,direction,adjusts_id,rate_per_15g,calculation_note,occurred_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [
              batch,
              step,
              dto.employee_id,
              dto.output_id ?? null,
              amount,
              dto.direction,
              dto.adjusts_id ?? null,
              dto.rate_per_15g ?? null,
              dto.calculation_note,
              dto.occurred_at,
              actor,
            ],
          )
        ).rows[0];
      },
    );
  }
  async read(batch: string) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const b = await this.batch(batch, c);
      const stages = (
        await c.query(
          'SELECT * FROM batch_steps WHERE batch_id=$1 ORDER BY display_order',
          [batch],
        )
      ).rows;
      const dependencies = (
        await c.query(
          'SELECT * FROM batch_step_dependencies WHERE batch_id=$1',
          [batch],
        )
      ).rows;
      for (const stage of stages) {
        stage.waiting_for = dependencies
          .filter((d) => d.step_id === stage.step_id)
          .map((d) => stages.find((s) => s.step_id === d.depends_on_id))
          .filter((s) => s && s.execution_status !== 'COMPLETED')
          .map((s) => ({
            step_id: s.step_id,
            name: s.name,
            execution_status: s.execution_status,
          }));
        stage.dependencies = dependencies
          .filter((d) => d.step_id === stage.step_id)
          .map((d) => d.depends_on_id);
        stage.remaining_quantity =
          b.planned_quantity - stage.completed_quantity;
      }
      const assignments = (
        await c.query(
          `SELECT a.*,e.full_name employee_name,e.employee_code,COALESCE((SELECT sum(pc.quantity)::int FROM batch_effective_output_contributions pc WHERE pc.assignment_id=a.id),0) completed_quantity,
          COALESCE(a.applied_labor_rate_per_15g,s.labor_rate_per_15g)::text applied_rate,
          CASE WHEN a.planned_quantity IS NULL OR b.standard_weight_per_unit_g IS NULL OR COALESCE(a.applied_labor_rate_per_15g,s.labor_rate_per_15g) IS NULL THEN NULL ELSE round(a.planned_quantity::numeric*b.standard_weight_per_unit_g*COALESCE(a.applied_labor_rate_per_15g,s.labor_rate_per_15g)/15,4)::text END planned_labor,
          (SELECT h.after_state->'labor_grant' FROM batch_assignment_events h WHERE h.assignment_id=a.id AND h.after_state ? 'labor_grant' ORDER BY h.created_at DESC,h.id DESC LIMIT 1) grant_pricing,
          COALESCE(r.status,'OPEN') reconciliation_status,r.difference_gold_g::text closed_difference_gold_g,r.issued_gold_g::text closed_issued_gold_g,r.received_gold_g::text closed_received_gold_g,r.closed_at,u.username closed_by_name
          FROM batch_assignments a JOIN employees e ON e.id=a.employee_id JOIN batch_steps s ON s.batch_id=a.batch_id AND s.step_id=a.step_id JOIN production_batches b ON b.id=a.batch_id LEFT JOIN batch_worker_reconciliations r ON r.assignment_id=a.id LEFT JOIN users u ON u.id=r.closed_by WHERE a.batch_id=$1 ORDER BY a.assigned_at,a.id`,
          [batch],
        )
      ).rows;
      for (const assignment of assignments) {
        const pricing = assignment.grant_pricing;
        delete assignment.grant_pricing;
        assignment.applied_currency = pricing?.currency ?? 'THB';
        assignment.planned_labor_by_currency = pricing?.labor_totals ?? {
          THB:
            assignment.planned_quantity === 0
              ? '0'
              : (pricing?.planned_labor_total ?? assignment.planned_labor),
        };
        const currencies = Object.keys(assignment.planned_labor_by_currency);
        assignment.planned_labor =
          currencies.length === 1
            ? assignment.planned_labor_by_currency[currencies[0]]
            : null;
      }
      const outputs = (
        await c.query(
          "SELECT o.*,(SELECT COALESCE(sum(ec.quantity),0)::int FROM batch_effective_output_contributions ec WHERE ec.output_id=o.id) quantity,COALESCE((SELECT jsonb_agg(jsonb_build_object('employee_name',e.full_name,'assignment_id',a.id,'quantity',pc.quantity)) FROM batch_effective_output_contributions pc JOIN batch_assignments a ON a.id=pc.assignment_id JOIN employees e ON e.id=a.employee_id WHERE pc.output_id=o.id),'[]'::jsonb) contributors FROM batch_outputs o WHERE o.batch_id=$1 ORDER BY occurred_at DESC,id",
          [batch],
        )
      ).rows;
      const data: Row = {
        version: this.rbac.version({ id: b.id, revision: b.revision }),
        planned_quantity: b.planned_quantity,
        join_policy: 'ALL_DEPENDENCIES_COMPLETED',
        default_labor_currency: 'THB', // Existing workflow rates were defined in THB.
        stages,
        assignments,
        outputs,
      };
      for (const [key, table] of [
        ['materials', 'batch_material_movements'],
        ['losses', 'batch_loss_entries'],
        ['labor', 'batch_labor_entries'],
      ])
        data[key] = (
          await c.query(
            `SELECT t.*,e.full_name employee_name,u.username actor_name FROM ${table} t JOIN employees e ON e.id=t.employee_id JOIN users u ON u.id=t.created_by WHERE t.batch_id=$1 ORDER BY t.occurred_at DESC,t.id`,
            [batch],
          )
        ).rows;
      data.reconciliation = await this.balances(batch, c);
      data.assignment_events = (
        await c.query(
          'SELECT h.*,u.username actor_name FROM batch_assignment_events h JOIN batch_assignments a ON a.id=h.assignment_id JOIN users u ON u.id=h.actor_id WHERE a.batch_id=$1 ORDER BY h.created_at DESC,h.id',
          [batch],
        )
      ).rows;
      data.reconciliation_events = (
        await c.query(
          'SELECT h.*,u.username actor_name FROM batch_reconciliation_events h JOIN batch_assignments a ON a.id=h.assignment_id JOIN users u ON u.id=h.actor_id WHERE a.batch_id=$1 ORDER BY h.created_at DESC,h.id',
          [batch],
        )
      ).rows;
      for (const assignment of assignments) {
        let issued = 0n,
          received = 0n;
        for (const m of data.materials.filter(
          (m: Row) =>
            m.step_id === assignment.step_id &&
            m.employee_id === assignment.employee_id &&
            m.material_type === 'GOLD',
        )) {
          const qty = units(m.quantity) * BigInt(m.effect);
          if (['INITIAL', 'ADDITIONAL', 'TRANSFER_IN'].includes(m.kind))
            issued += qty;
          else received += qty;
        }
        assignment.gold_issued_g = toDecimal(issued);
        assignment.gold_received_g = toDecimal(received);
      }
      data.standard_weight_per_unit_g = b.standard_weight_per_unit_g;
      data.planned_weight_g =
        b.standard_weight_per_unit_g == null
          ? null
          : toDecimal(
              units(b.standard_weight_per_unit_g) * BigInt(b.planned_quantity),
            );
      data.labor_totals = (
        await c.query(
          "SELECT l.step_id,l.employee_id,e.full_name employee_name,sum(CASE WHEN direction='INCREASE' THEN amount ELSE -amount END)::text amount FROM batch_labor_entries l JOIN employees e ON e.id=l.employee_id WHERE batch_id=$1 GROUP BY l.step_id,l.employee_id,e.full_name ORDER BY e.full_name",
          [batch],
        )
      ).rows;
      const tx = await loadExecutionTransactions(c, batch);
      data.transactions = tx.transactions;
      for (const t of data.transactions) {
        if (['COMPLETED', 'CANCELLED'].includes(b.status))
          t.blocked_reason =
            'Lô đã đóng; chưa có nghiệp vụ mở lại lô để điều chỉnh';
        const a = assignments.find((a) => a.id === t.assignment_id);
        if (!t.blocked_reason && a?.reconciliation_status === 'CLOSED')
          t.blocked_reason =
            'Mở lại đối soát với lý do trước khi sửa/xóa giao dịch';
        if (
          !t.blocked_reason &&
          data.labor.some(
            (l: Row) =>
              l.step_id === t.step_id && l.employee_id === t.employee_id,
          )
        )
          t.blocked_reason =
            'Đã có bút toán tiền công thực tế; cần nghiệp vụ đảo riêng';
      }
      for (const m of data.materials)
        m.correction_generated = tx.generatedMaterials.has(m.id);
      for (const o of data.outputs)
        o.correction_generated = tx.generatedOutputs.has(o.id);
      // Keep shared assignment/audit references in storage, but do not show an
      // empty recipient left behind after their last operation was deleted.
      data.assignments = assignments.filter((assignment) => {
        if (
          (assignment.planned_quantity ?? 0) > 0 ||
          assignment.completed_quantity > 0
        )
          return true;
        if (
          tx.transactions.some(
            (transaction) =>
              transaction.assignment_id === assignment.id &&
              !transaction.state.voided &&
              (transaction.state.quantity !== 0 ||
                transaction.state.completed_quantity > 0 ||
                (transaction.has_gold &&
                  /[1-9]/.test(transaction.state.gold_weight_g))),
          )
        )
          return true;
        const related = (entry: Row) =>
          entry.step_id === assignment.step_id &&
          entry.employee_id === assignment.employee_id &&
          !entry.correction_generated;
        return (
          data.materials.some(
            (entry: Row) => entry.material_type !== 'GOLD' && related(entry),
          ) ||
          data.labor.some(related) ||
          data.losses.some(related)
        );
      });
      await c.query('COMMIT');
      return { data };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
