import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  BatchQueryDto,
  CreateBatchDto,
  UpdateBatchDto,
  UpdateBatchWorkflowDto,
  ChangeBatchStatusDto,
} from './production.dto.js';
import { ProductionService } from './production.service.js';
type Actor = { user: { sub: string } };
@Controller('production-batches')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ProductionController {
  constructor(private readonly service: ProductionService) {}
  @Get() @RequirePermissions('production.read') list(
    @Query() q: BatchQueryDto,
  ) {
    return this.service.list(q);
  }
  @Get('workflow-preview')
  @RequirePermissions('production.create', 'design_models.read')
  preview(@Query('design_model_id', ParseUUIDPipe) id: string) {
    return this.service.preview(id);
  }
  @Post() @RequirePermissions('production.create', 'design_models.read') create(
    @Body() dto: CreateBatchDto,
    @Req() req: Actor,
  ) {
    return this.service.create(dto, req.user.sub);
  }
  @Get(':id') @RequirePermissions('production.read') detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(id);
  }
  @Patch(':id') @RequirePermissions('production.update') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBatchDto,
    @Req() req: Actor,
  ) {
    return this.service.update(id, dto, req.user.sub);
  }
  @Get(':id/workflow') @RequirePermissions('production.read') workflow(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getWorkflow(id);
  }
  @Patch(':id/workflow')
  @RequirePermissions('production.workflow.update')
  updateWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBatchWorkflowDto,
    @Req() req: Actor,
  ) {
    return this.service.updateWorkflow(id, dto, req.user.sub);
  }
  @Get(':id/status-history')
  @RequirePermissions('production.read')
  statusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: BatchQueryDto,
  ) {
    return this.service.history(id, 'status', q);
  }
  @Get(':id/audit-history') @RequirePermissions('production.read') audit(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: BatchQueryDto,
  ) {
    return this.service.history(id, 'audit', q);
  }
  @Patch(':id/status') @RequirePermissions('production.status.update') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeBatchStatusDto,
    @Req() req: Actor,
  ) {
    return this.service.changeStatus(id, dto, req.user.sub);
  }
}
