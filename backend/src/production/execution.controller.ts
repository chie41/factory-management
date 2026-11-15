import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { ExecutionService } from './execution.service.js';
import {
  StageActionDto,
  AssignmentDto,
  OutputDto,
  MaterialDto,
  MaterialTransferDto,
  MaterialReverseDto,
  LossDto,
  LaborDto,
  ReconcileDto,
  WorkGoldDto,
  TransactionChangeDto,
  TransactionDeleteDto,
  GoldReceiptDto,
} from './execution.dto.js';
type Actor = { user: { sub: string } };
@Controller('production-batches/:id/execution')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ExecutionController {
  @Post('transactions/:transactionId/edit')
  @RequirePermissions('production.adjustments.manage')
  editTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: TransactionChangeDto,
    @Req() actor: Actor,
  ) {
    return this.service.changeTransaction(
      id,
      transactionId,
      'EDIT',
      dto,
      actor.user.sub,
    );
  }
  @Post('transactions/:transactionId/delete')
  @RequirePermissions('production.adjustments.manage')
  deleteTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: TransactionDeleteDto,
    @Req() actor: Actor,
  ) {
    return this.service.changeTransaction(
      id,
      transactionId,
      'DELETE',
      { ...dto, reason: 'Xóa giao dịch nhập nhầm' },
      actor.user.sub,
    );
  }
  @Post('stages/:stepId/work-gold')
  @RequirePermissions('production.assignments.manage')
  workGold(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: WorkGoldDto,
    @Req() actor: Actor,
  ) {
    return this.service.issueWork(id, step, dto, actor.user.sub);
  }
  @Post('stages/:stepId/gold-receipts')
  @RequirePermissions('production.materials.manage')
  goldReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: GoldReceiptDto,
    @Req() actor: Actor,
  ) {
    return this.service.recordGold(id, step, dto, actor.user.sub);
  }
  @Post('stages/:stepId/reconciliation')
  @RequirePermissions('production.reconciliation.manage')
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: ReconcileDto,
    @Req() actor: Actor,
  ) {
    return this.service.reconcile(id, step, dto, actor.user.sub);
  }
  constructor(private readonly service: ExecutionService) {}
  @Get() @RequirePermissions('production.read') read(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.read(id);
  }
  @Post('stages/:stepId/action')
  @RequirePermissions('production.execution.manage')
  action(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: StageActionDto,
    @Req() actor: Actor,
  ) {
    return this.service.stageAction(id, step, dto, actor.user.sub);
  }
  @Post('stages/:stepId/assignments')
  @RequirePermissions('production.assignments.manage')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: AssignmentDto,
    @Req() actor: Actor,
  ) {
    return this.service.assign(id, step, dto, actor.user.sub);
  }
  @Post('stages/:stepId/outputs')
  @RequirePermissions('production.output.manage')
  output(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: OutputDto,
    @Req() actor: Actor,
  ) {
    return this.service.output(id, step, dto, actor.user.sub);
  }
  @Post('stages/:stepId/materials')
  @RequirePermissions('production.materials.manage')
  material(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: MaterialDto,
    @Req() actor: Actor,
  ) {
    return this.service.materialMovement(id, step, dto, actor.user.sub);
  }
  @Post('stages/:stepId/transfers')
  @RequirePermissions('production.materials.manage')
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: MaterialTransferDto,
    @Req() actor: Actor,
  ) {
    return this.service.transfer(id, step, dto, actor.user.sub);
  }
  @Post('material-reversals')
  @RequirePermissions('production.adjustments.manage')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MaterialReverseDto,
    @Req() actor: Actor,
  ) {
    return this.service.reverse(id, dto, actor.user.sub);
  }
  @Post('stages/:stepId/losses')
  @RequirePermissions('production.losses.manage')
  loss(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: LossDto,
    @Req() actor: Actor,
  ) {
    return this.service.loss(id, step, dto, actor.user.sub);
  }
  @Post('stages/:stepId/labor')
  @RequirePermissions('production.labor.manage')
  labor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId') step: string,
    @Body() dto: LaborDto,
    @Req() actor: Actor,
  ) {
    return this.service.labor(id, step, dto, actor.user.sub);
  }
}
