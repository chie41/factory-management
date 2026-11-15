import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CatalogModule } from '../catalog/catalog.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { ProductionController } from './production.controller.js';
import { ProductionService } from './production.service.js';
import { ExecutionController } from './execution.controller.js';
import { ExecutionService } from './execution.service.js';
@Module({
  imports: [
    CatalogModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: 86400 },
    }),
  ],
  controllers: [ProductionController,ExecutionController],
  providers: [ProductionService,ExecutionService, JwtAuthGuard, PermissionGuard],
})
export class ProductionModule {}
