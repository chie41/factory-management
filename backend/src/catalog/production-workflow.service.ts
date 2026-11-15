import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { RbacService } from '../auth/rbac.service.js';
import { CatalogService } from './catalog.service.js';
import {
  ProductionDefinitionDto,
  ProductionWorkflowDto,
} from './production-workflow.dto.js';

export type WorkflowOwner = 'group' | 'model';
@Injectable()
export class ProductionWorkflowService {
  constructor(
    private readonly rbac: RbacService,
    private readonly catalog: CatalogService,
  ) {}

  private normalize(
    definition: ProductionDefinitionDto | null,
  ): ProductionDefinitionDto | null {
    if (!definition) return null;
    return {
      ...definition,
      steps: definition.steps.map((step) => ({
        ...step,
        description: step.description ?? '',
        requiresEmployeeConfirmation:
          step.requiresEmployeeConfirmation ?? false,
        laborRatePer15g: step.laborRatePer15g ?? null,
        estimatedDurationMinutes: step.estimatedDurationMinutes ?? null,
      })),
    };
  }

  validate(workflow: ProductionDefinitionDto) {
    if (!workflow || !Array.isArray(workflow.steps))
      throw new BadRequestException('Cấu trúc quy trình không hợp lệ');
    const steps = new Map(workflow.steps.map((step) => [step.id, step]));
    if (steps.size !== workflow.steps.length)
      throw new BadRequestException('Trùng ID công đoạn');
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id))
        throw new BadRequestException('Quy trình có chu trình phụ thuộc');
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of steps.get(id)!.dependencies) {
        if (!steps.has(dependency))
          throw new BadRequestException('Dependency không tồn tại');
        if (dependency === id)
          throw new BadRequestException(
            'Công đoạn không thể phụ thuộc chính nó',
          );
        visit(dependency);
      }
      visiting.delete(id);
      visited.add(id);
    };
    workflow.steps.forEach((step) => visit(step.id));
  }

  /** Single-statement snapshot: inherited definitions are never copied on read. */
  async resolveEffectiveWorkflow(
    kind: WorkflowOwner,
    id: string,
    c: Pick<PoolClient, 'query'> = this.rbac.pool,
  ) {
    const model = kind === 'model';
    const row = (
      await c.query(
        `SELECT o.id,o.name,o.updated_at,
      ${model ? 'o.group_id,o.workflow_mode,g.name group_name' : "o.id group_id,'GROUP'::text workflow_mode,o.name group_name"},
      own.id own_revision_id,own.revision own_revision,own.definition own_definition,
      parent.id parent_revision_id,parent.revision parent_revision,parent.definition parent_definition
      FROM ${model ? 'design_models' : 'design_model_groups'} o
      ${model ? 'LEFT JOIN design_model_groups g ON g.id=o.group_id' : ''}
      LEFT JOIN LATERAL (SELECT * FROM production_workflow_revisions WHERE ${model ? 'model_id' : 'group_id'}=o.id ORDER BY revision DESC LIMIT 1) own ON true
      LEFT JOIN LATERAL (SELECT * FROM production_workflow_revisions WHERE group_id=${model ? 'o.group_id' : 'o.id'} ORDER BY revision DESC LIMIT 1) parent ON true
      WHERE o.id=$1`,
        [id],
      )
    ).rows[0];
    if (!row)
      throw new NotFoundException('Không tìm thấy mẫu mã / nhóm mẫu mã');
    const inherit = model && row.workflow_mode === 'INHERIT';
    return {
      id,
      mode: row.workflow_mode as 'GROUP' | 'INHERIT' | 'CUSTOM',
      group_id: row.group_id,
      group_name: row.group_name,
      source: inherit || !model ? 'GROUP' : 'MODEL',
      revision_id:
        (inherit ? row.parent_revision_id : row.own_revision_id) ?? null,
      revision: (inherit ? row.parent_revision : row.own_revision) ?? null,
      effectiveWorkflow: this.normalize(
        (inherit
          ? row.parent_definition
          : row.own_definition) as ProductionDefinitionDto | null,
      ),
      version: this.rbac.version({
        id,
        updated_at: row.updated_at,
        mode: row.workflow_mode,
        group_id: row.group_id,
        own: row.own_revision_id,
        parent: inherit ? row.parent_revision_id : null,
      }),
    };
  }

  async history(kind: WorkflowOwner, id: string) {
    await this.resolveEffectiveWorkflow(kind, id);
    return {
      data: (
        await this.rbac.pool.query(
          `SELECT id,revision,definition,created_by,created_at FROM production_workflow_revisions WHERE ${kind === 'group' ? 'group_id' : 'model_id'}=$1 ORDER BY revision DESC LIMIT 100`,
          [id],
        )
      ).rows,
    };
  }

  async save(
    kind: WorkflowOwner,
    id: string,
    dto: ProductionWorkflowDto,
    actor: string,
  ) {
    const c = await this.rbac.pool.connect();
    try {
      await c.query('BEGIN');
      // Same lock as catalog edits: group moves, deletes and workflow edits serialize.
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:catalog'))",
      );
      await this.rbac.require(
        actor,
        [
          kind === 'group'
            ? 'design_models.groups.manage'
            : 'design_models.update',
        ],
        c,
      );
      const before = await this.resolveEffectiveWorkflow(kind, id, c);
      this.rbac.checkVersion(dto.version, before.version);
      if (dto.groupInfo && (kind !== 'group' || dto.action !== 'SAVE'))
        throw new BadRequestException(
          'Thông tin nhóm chỉ được lưu cùng quy trình nhóm',
        );
      const groupBefore = dto.groupInfo
        ? await this.catalog.group(id, c)
        : undefined;
      if (dto.groupInfo && groupBefore)
        this.rbac.checkVersion(dto.groupInfo.version, groupBefore.version);
      if (kind === 'group' && dto.action !== 'SAVE')
        throw new BadRequestException('Nhóm chỉ hỗ trợ lưu quy trình');
      if (dto.action !== 'SAVE' && dto.workflow !== undefined)
        throw new BadRequestException(
          'Chuyển chế độ không nhận cấu hình từ client',
        );
      let definition: ProductionDefinitionDto | undefined;
      if (dto.action === 'SAVE') {
        if (kind === 'model' && before.mode !== 'CUSTOM')
          throw new BadRequestException('Chuyển sang tùy chỉnh trước khi lưu');
        if (!dto.workflow && !dto.groupInfo)
          throw new BadRequestException('Thiếu cấu hình quy trình');
        if (dto.workflow) {
          this.validate(dto.workflow);
          definition = this.normalize({
            ...before.effectiveWorkflow,
            steps: dto.workflow.steps,
            ...(dto.workflow.name !== undefined
              ? { name: dto.workflow.name }
              : {}),
            ...(dto.workflow.description !== undefined
              ? { description: dto.workflow.description }
              : {}),
          })!;
        }
      } else if (dto.action === 'CUSTOMIZE') {
        if (before.mode !== 'INHERIT')
          throw new BadRequestException('Mẫu đã ở chế độ tùy chỉnh');
        definition = before.effectiveWorkflow ?? {
          steps: [],
        };
      }
      if (dto.groupInfo)
        await c.query(
          'UPDATE design_model_groups SET name=$2,default_labor_price_per_15g=$3,updated_by=$4,updated_at=clock_timestamp() WHERE id=$1',
          [
            id,
            dto.groupInfo.name.trim(),
            dto.groupInfo.default_labor_price_per_15g !== undefined
              ? dto.groupInfo.default_labor_price_per_15g
              : (groupBefore?.default_labor_price_per_15g ?? null),
            actor,
          ],
        );
      if (definition) {
        const column = kind === 'group' ? 'group_id' : 'model_id';
        await c.query(
          `INSERT INTO production_workflow_revisions(${column},revision,definition,created_by)
          SELECT $1,COALESCE(MAX(revision),0)+1,$2::jsonb,$3 FROM production_workflow_revisions WHERE ${column}=$1`,
          [id, JSON.stringify(definition), actor],
        );
      }
      if (kind === 'model')
        await c.query(
          'UPDATE design_models SET workflow_mode=$2,updated_at=clock_timestamp(),updated_by=$3 WHERE id=$1',
          [id, dto.action === 'INHERIT' ? 'INHERIT' : 'CUSTOM', actor],
        );
      const data = await this.resolveEffectiveWorkflow(kind, id, c);
      await c.query(
        'INSERT INTO security_audit(actor_id,target_id,action,before_state,after_state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',
        [
          actor,
          id,
          `production_workflow.${kind}.${dto.action.toLowerCase()}`,
          JSON.stringify({
            ...before,
            ...(groupBefore ? { groupInfo: groupBefore } : {}),
          }),
          JSON.stringify({
            ...data,
            ...(dto.groupInfo
              ? { groupInfo: await this.catalog.group(id, c) }
              : {}),
          }),
        ],
      );
      await c.query('COMMIT');
      return { data };
    } catch (e) {
      await c.query('ROLLBACK');
      if ((e as { code?: string }).code === '23505')
        throw new ConflictException(
          'Tên nhóm đã tồn tại. Toàn bộ thay đổi chưa được lưu.',
        );
      throw e;
    } finally {
      c.release();
    }
  }
}
