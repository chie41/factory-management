import { units } from '../customer-ledger/ledger-decimal.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { RbacService } from '../auth/rbac.service.js';
import { ProductionWorkflowService } from '../catalog/production-workflow.service.js';
import type { ProductionDefinitionDto } from '../catalog/production-workflow.dto.js';
import {
  BatchQueryDto,
  CreateBatchDto,
  UpdateBatchDto,
  UpdateBatchWorkflowDto,
  ChangeBatchStatusDto,
} from './production.dto.js';
type Row = Record<string, any>;
@Injectable()
export class ProductionService {
  constructor(
    private readonly rbac: RbacService,
    private readonly workflows: ProductionWorkflowService,
  ) {}
  private version(row: Row) {
    return this.rbac.version({ id: row.id, revision: row.revision });
  }
  private async transaction<T>(
    actor: string,
    permission: string,
    work: (c: PoolClient) => Promise<T>,
  ) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:production'))",
      );
      await this.rbac.require(actor, [permission], c);
      const result = await work(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      if ((e as { code?: string }).code === '23503')
        throw new ConflictException(
          'Dữ liệu đang được nghiệp vụ khác tham chiếu. Không thể sửa/xóa cấu hình liên quan.',
        );
      if (['22007', '22008'].includes((e as { code?: string }).code ?? ''))
        throw new BadRequestException('Ngày kế hoạch không hợp lệ');
      throw e;
    } finally {
      c.release();
    }
  }
  private plan(dto: {
    planned_start_at?: string | null;
    planned_end_at?: string | null;
    planned_start?: string | null;
    planned_end?: string | null;
  }) {
    for (const at of [dto.planned_start_at, dto.planned_end_at])
      if (
        at &&
        (!/(Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at)))
      )
        throw new BadRequestException('Ngày giờ phải hợp lệ và có timezone');
    if (
      dto.planned_start_at &&
      dto.planned_end_at &&
      Date.parse(dto.planned_end_at) <= Date.parse(dto.planned_start_at)
    )
      throw new BadRequestException(
        'Thời điểm hoàn thành phải sau thời điểm bắt đầu',
      );
    for (const date of [dto.planned_start, dto.planned_end]) {
      if (date) {
        const parsed = new Date(date + 'T00:00:00Z');
        if (
          !Number.isFinite(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== date
        )
          throw new BadRequestException('Ngày kế hoạch không hợp lệ');
      }
    }
    if (
      dto.planned_start &&
      dto.planned_end &&
      dto.planned_end < dto.planned_start
    )
      throw new BadRequestException(
        'Ngày kết thúc dự kiến phải từ ngày bắt đầu',
      );
  }
  async list(q: BatchQueryDto) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const values: unknown[] = [q.q?.trim() ?? ''];
      let where =
        "($1='' OR strpos(lower(b.code),lower($1))>0 OR strpos(lower(b.model_code_snapshot),lower($1))>0 OR strpos(lower(b.model_name_snapshot),lower($1))>0)";
      if (q.status) {
        values.push(q.status);
        where += ` AND b.status=$${values.length}`;
      }
      if (q.design_model_id) {
        values.push(q.design_model_id);
        where += ` AND b.design_model_id=$${values.length}`;
      }
      const total = (
        await c.query(
          `SELECT count(*)::int total FROM production_batches b WHERE ${where}`,
          values,
        )
      ).rows[0].total;
      values.push(q.page_size, (q.page - 1) * q.page_size);
      const rows = (
        await c.query(
          `SELECT b.*,u.username created_by_name FROM production_batches b JOIN users u ON u.id=b.created_by WHERE ${where} ORDER BY b.${q.sort} ${q.direction === 'asc' ? 'ASC' : 'DESC'} NULLS LAST,b.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows;
      await c.query('COMMIT');
      return {
        data: rows.map((row) => this.present(row)),
        meta: { total, page: q.page, page_size: q.page_size },
      };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  private present(row: Row) {
    const { intent_hash, request_id, ...safe } = row;
    return { ...safe, version: this.version(row) };
  }
  private async batch(
    id: string,
    c: Pick<PoolClient, 'query'> = this.rbac.pool,
  ) {
    const row = (
      await c.query(
        'SELECT b.*,u.username created_by_name,v.username updated_by_name FROM production_batches b JOIN users u ON u.id=b.created_by JOIN users v ON v.id=b.updated_by WHERE b.id=$1',
        [id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy lô sản xuất');
    return row;
  }
  private async workflow(id: string, c: Pick<PoolClient, 'query'>) {
    return (
      await c.query(
        'SELECT * FROM batch_workflow_snapshots WHERE batch_id=$1 ORDER BY revision DESC LIMIT 1',
        [id],
      )
    ).rows[0];
  }
  async detail(id: string) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const row = await this.batch(id, c),
        snapshot = await this.workflow(id, c);
      const steps = (
        await c.query(
          'SELECT step_id,execution_started_at,execution_locked_at FROM batch_steps WHERE batch_id=$1 ORDER BY display_order',
          [id],
        )
      ).rows;
      await c.query('COMMIT');
      return {
        data: {
          ...this.present(row),
          workflow_snapshot: snapshot,
          has_execution: steps.some(
            (s) =>
              s.execution_started_at != null || s.execution_locked_at != null,
          ),
          execution_available: true,
        },
      };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async preview(modelId: string) {
    return {
      data: {
        ...(await this.workflows.resolveEffectiveWorkflow('model', modelId)),
        standard_weight_per_unit_g:
          (
            await this.rbac.pool.query(
              'SELECT weight_g FROM design_models WHERE id=$1',
              [modelId],
            )
          ).rows[0]?.weight_g ?? null,
      },
    };
  }
  private async audit(
    c: PoolClient,
    id: string,
    actor: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    await c.query(
      'INSERT INTO batch_audit_events(batch_id,actor_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
      [id, actor, action, JSON.stringify(before), JSON.stringify(after)],
    );
  }
  private async appendWorkflow(
    c: PoolClient,
    id: string,
    actor: string,
    definition: ProductionDefinitionDto,
  ) {
    this.workflows.validate(definition);
    const normalized = {
      ...definition,
      steps: definition.steps.map((s) => ({
        ...s,
        description: s.description ?? '',
        requiresEmployeeConfirmation: s.requiresEmployeeConfirmation ?? false,
        laborRatePer15g: s.laborRatePer15g ?? null,
        estimatedDurationMinutes: s.estimatedDurationMinutes ?? null,
      })),
    };
    await c.query(
      'INSERT INTO batch_workflow_snapshots(batch_id,revision,definition,created_by) SELECT $1,COALESCE(MAX(revision),0)+1,$2::jsonb,$3 FROM batch_workflow_snapshots WHERE batch_id=$1',
      [id, JSON.stringify(normalized), actor],
    );
    // Current configuration is relational; immutable snapshots retain every revision.
    // Execution data must reference these stable composite keys with RESTRICT.
    await c.query('DELETE FROM batch_step_dependencies WHERE batch_id=$1', [
      id,
    ]);
    const ids = normalized.steps.map((s) => s.id);
    await c.query(
      'DELETE FROM batch_steps WHERE batch_id=$1 AND NOT(step_id=ANY($2::text[]))',
      [id, ids],
    );
    for (const [index, step] of normalized.steps.entries())
      await c.query(
        `INSERT INTO batch_steps(batch_id,step_id,display_order,name,description,labor_rate_per_15g,requires_employee_confirmation,estimated_duration_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(batch_id,step_id) DO UPDATE SET display_order=EXCLUDED.display_order,name=EXCLUDED.name,description=EXCLUDED.description,labor_rate_per_15g=EXCLUDED.labor_rate_per_15g,requires_employee_confirmation=EXCLUDED.requires_employee_confirmation,estimated_duration_minutes=EXCLUDED.estimated_duration_minutes`,
        [
          id,
          step.id,
          index,
          step.name,
          step.description,
          step.laborRatePer15g,
          step.requiresEmployeeConfirmation,
          step.estimatedDurationMinutes,
        ],
      );
    for (const step of normalized.steps)
      for (const dependency of step.dependencies)
        await c.query(
          'INSERT INTO batch_step_dependencies(batch_id,step_id,depends_on_id) VALUES($1,$2,$3)',
          [id, step.id, dependency],
        );
    return this.workflow(id, c);
  }
  async create(dto: CreateBatchDto, actor: string) {
    this.plan(dto);
    return this.transaction(actor, 'production.create', async (c) => {
      const hash = this.rbac.version({
        model: dto.design_model_id,
        quantity: dto.planned_quantity,
        start: dto.planned_start ?? null,
        end: dto.planned_end ?? null,
        note: dto.note ?? null,
        source: dto.source_version,
        workflow: dto.workflow ?? null,
        startAt: dto.planned_start_at ?? null,
        endAt: dto.planned_end_at ?? null,
      });
      const existing = (
        await c.query('SELECT * FROM production_batches WHERE request_id=$1', [
          dto.request_id,
        ])
      ).rows[0];
      if (existing) {
        if (existing.created_by !== actor || existing.intent_hash !== hash)
          throw new ConflictException(
            'Mã yêu cầu đã được dùng cho nội dung khác',
          );
        return { data: this.present(existing) };
      }
      await this.rbac.require(actor, ['design_models.read'], c);
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:catalog'))",
      );
      const model = (
        await c.query('SELECT * FROM design_models WHERE id=$1', [
          dto.design_model_id,
        ])
      ).rows[0];
      if (!model || model.status !== 'ACTIVE')
        throw new BadRequestException('Chọn mẫu mã đang hoạt động');
      const source = await this.workflows.resolveEffectiveWorkflow(
        'model',
        dto.design_model_id,
        c,
      );
      this.rbac.checkVersion(dto.source_version, source.version);
      if (!source.effectiveWorkflow || !source.revision_id)
        throw new BadRequestException(
          'Mẫu mã chưa có quy trình hiệu lực. Cấu hình quy trình trước khi tạo lô.',
        );
      const id = randomUUID();
      const sequence = (
        await c.query("SELECT nextval('production_batch_code_seq')::text value")
      ).rows[0].value as string;
      const code = 'LSX' + sequence.padStart(8, '0');
      const row = (
        await c.query(
          `INSERT INTO production_batches(id,code,design_model_id,model_code_snapshot,model_name_snapshot,planned_quantity,planned_start,planned_end,note,source_revision_id,source_metadata,request_id,intent_hash,created_by,updated_by,standard_weight_per_unit_g)
       VALUES($1,$14,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$13,$15) RETURNING *`,
          [
            id,
            model.id,
            model.code,
            model.name,
            dto.planned_quantity,
            dto.planned_start ?? null,
            dto.planned_end ?? null,
            dto.note ?? null,
            source.revision_id,
            JSON.stringify({
              mode: source.mode,
              group_id: source.group_id,
              group_name: source.group_name,
              revision_id: source.revision_id,
              revision: source.revision,
              version: source.version,
            }),
            dto.request_id,
            hash,
            actor,
            code,
            model.weight_g ?? null,
          ],
        )
      ).rows[0];
      await c.query(
        'UPDATE production_batches SET planned_start_at=$2,planned_end_at=$3 WHERE id=$1',
        [id, dto.planned_start_at ?? null, dto.planned_end_at ?? null],
      );
      row.planned_start_at = dto.planned_start_at ?? null;
      row.planned_end_at = dto.planned_end_at ?? null;
      const snapshot = await this.appendWorkflow(
        c,
        id,
        actor,
        dto.workflow ?? source.effectiveWorkflow,
      );
      await c.query(
        "INSERT INTO batch_status_history(batch_id,to_status,reason,actor_id) VALUES($1,'DRAFT','Tạo lô sản xuất',$2)",
        [id, actor],
      );
      await this.audit(c, id, actor, 'batch.create', null, {
        ...this.present(row),
        workflow_snapshot: snapshot,
      });
      return { data: this.present(row) };
    });
  }
  async update(id: string, dto: UpdateBatchDto, actor: string) {
    return this.transaction(actor, 'production.update', async (c) => {
      const before = await this.batch(id, c);
      this.rbac.checkVersion(dto.version, this.version(before));
      const plan = {
        planned_start_at:
          dto.planned_start_at !== undefined
            ? dto.planned_start_at
            : (before.planned_start_at?.toISOString?.() ??
              before.planned_start_at),
        planned_end_at:
          dto.planned_end_at !== undefined
            ? dto.planned_end_at
            : (before.planned_end_at?.toISOString?.() ?? before.planned_end_at),
        planned_start:
          dto.planned_start !== undefined
            ? dto.planned_start
            : before.planned_start,
        planned_end:
          dto.planned_end !== undefined ? dto.planned_end : before.planned_end,
      };
      this.plan(plan);
      if (
        dto.planned_quantity !== before.planned_quantity &&
        (before.status !== 'DRAFT' ||
          (
            await c.query(
              'SELECT 1 FROM batch_steps WHERE batch_id=$1 AND (execution_started_at IS NOT NULL OR execution_locked_at IS NOT NULL)',
              [id],
            )
          ).rowCount)
      )
        throw new ConflictException(
          'Chưa có quy tắc sửa kế hoạch khi lô đã phát sinh thực thi',
        );
      const row = (
        await c.query(
          'UPDATE production_batches SET planned_quantity=$2,planned_start=$3,planned_end=$4,note=$5,updated_by=$6,planned_start_at=$7,planned_end_at=$8,updated_at=clock_timestamp(),revision=revision+1 WHERE id=$1 RETURNING *',
          [
            id,
            dto.planned_quantity,
            plan.planned_start,
            plan.planned_end,
            dto.note !== undefined ? dto.note : before.note,
            actor,
            plan.planned_start_at ?? null,
            plan.planned_end_at ?? null,
          ],
        )
      ).rows[0];
      await this.audit(
        c,
        id,
        actor,
        'batch.plan.update',
        this.present(before),
        this.present(row),
      );
      return { data: this.present(row) };
    });
  }
  async updateWorkflow(id: string, dto: UpdateBatchWorkflowDto, actor: string) {
    return this.transaction(actor, 'production.workflow.update', async (c) => {
      const row = await this.batch(id, c);
      this.rbac.checkVersion(dto.version, this.version(row));
      if (['COMPLETED', 'CANCELLED'].includes(row.status))
        throw new ConflictException('Lô đã đóng');
      const protectedSteps = (
        await c.query(
          'SELECT * FROM batch_steps WHERE batch_id=$1 AND (execution_started_at IS NOT NULL OR execution_locked_at IS NOT NULL)',
          [id],
        )
      ).rows;
      const allDeps = (
        await c.query(
          'SELECT * FROM batch_step_dependencies WHERE batch_id=$1',
          [id],
        )
      ).rows;
      for (const old of protectedSteps) {
        const next = dto.workflow.steps.find((s) => s.id === old.step_id);
        const oldDeps = allDeps
          .filter((d) => d.step_id === old.step_id)
          .map((d) => d.depends_on_id)
          .sort();
        const config = (s: Record<string, any>) =>
          JSON.stringify({
            name: s.name,
            description: s.description ?? '',
            rate:
              s.laborRatePer15g == null
                ? null
                : units(String(s.laborRatePer15g)).toString(),
            duration: s.estimatedDurationMinutes ?? null,
            confirmation: s.requiresEmployeeConfirmation ?? false,
          });
        if (
          !next ||
          config(next) !==
            config({
              name: old.name,
              description: old.description,
              laborRatePer15g: old.labor_rate_per_15g,
              estimatedDurationMinutes: old.estimated_duration_minutes,
              requiresEmployeeConfirmation: old.requires_employee_confirmation,
            }) ||
          JSON.stringify([...next.dependencies].sort()) !==
            JSON.stringify(oldDeps)
        )
          throw new ConflictException(
            'Không sửa/xóa cấu hình hoặc dependency của công đoạn đã có nghiệp vụ: ' +
              old.name,
          );
      }
      const before = await this.workflow(id, c);
      const snapshot = await this.appendWorkflow(c, id, actor, dto.workflow);
      const after = (
        await c.query(
          'UPDATE production_batches SET revision=revision+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',
          [id, actor],
        )
      ).rows[0];
      await this.audit(c, id, actor, 'batch.workflow.update', before, snapshot);
      return { data: { ...this.present(after), workflow_snapshot: snapshot } };
    });
  }
  async getWorkflow(id: string) {
    const result = await this.detail(id);
    return {
      data: { version: result.data.version, ...result.data.workflow_snapshot },
    };
  }
  async history(id: string, kind: 'status' | 'audit', q: BatchQueryDto) {
    await this.batch(id);
    const table =
      kind === 'status' ? 'batch_status_history' : 'batch_audit_events';
    const data = (
      await this.rbac.pool.query(
        `SELECT h.*,u.username actor_name FROM ${table} h JOIN users u ON u.id=h.actor_id WHERE batch_id=$1 ORDER BY h.created_at DESC,h.id LIMIT $2 OFFSET $3`,
        [id, q.page_size, (q.page - 1) * q.page_size],
      )
    ).rows;
    return {
      data,
      meta: {
        page: q.page,
        page_size: q.page_size,
        has_more: data.length === q.page_size,
      },
    };
  }
  async changeStatus(id: string, dto: ChangeBatchStatusDto, actor: string) {
    return this.transaction(actor, 'production.status.update', async (c) => {
      const before = await this.batch(id, c);
      this.rbac.checkVersion(dto.version, this.version(before));
      throw new ConflictException(
        'Chưa xác nhận state machine của lô sản xuất. Phase 02 chưa cho phép chuyển trạng thái.',
      );
    });
  }
}
