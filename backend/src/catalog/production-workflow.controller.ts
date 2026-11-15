import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { ProductionWorkflowDto } from './production-workflow.dto.js';
import { ProductionWorkflowService } from './production-workflow.service.js';

@Controller('design-model-groups/:id/production-workflow')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class GroupProductionWorkflowController {
  constructor(private readonly service: ProductionWorkflowService) {}
  @Get() @RequirePermissions('design_models.read') async get(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.resolveEffectiveWorkflow('group', id) };
  }
  @Get('revisions') @RequirePermissions('design_models.read') history(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.history('group', id);
  }
  @Patch() @RequirePermissions('design_models.groups.manage') save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductionWorkflowDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.service.save('group', id, dto, req.user.sub);
  }
}
@Controller('design-models/:id/production-workflow')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ModelProductionWorkflowController {
  constructor(private readonly service: ProductionWorkflowService) {}
  @Get() @RequirePermissions('design_models.read') async get(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.resolveEffectiveWorkflow('model', id) };
  }
  @Get('revisions') @RequirePermissions('design_models.read') history(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.history('model', id);
  }
  @Patch() @RequirePermissions('design_models.update') save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductionWorkflowDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.service.save('model', id, dto, req.user.sub);
  }
}
