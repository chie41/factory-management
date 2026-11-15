import { LaborPricingService } from './labor-pricing.service.js';
import { ProductionWorkflowService } from './production-workflow.service.js';
import { GroupProductionWorkflowController, ModelProductionWorkflowController } from './production-workflow.controller.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { CatalogService } from './catalog.service.js';
import {
  BomsController,
  CatalogImagesController,
  ComponentsController,
  DesignsController,
  DesignGroupsController,
} from './catalog.controller.js';
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: 86400 },
    }),
  ],
  controllers: [
    GroupProductionWorkflowController,
    ModelProductionWorkflowController,
    DesignsController,
    DesignGroupsController,
    ComponentsController,
    BomsController,
    CatalogImagesController,
  ],
  providers: [ProductionWorkflowService,LaborPricingService,CatalogService, JwtAuthGuard, PermissionGuard],
  exports: [ProductionWorkflowService],
})
export class CatalogModule {}
