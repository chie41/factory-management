import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { GoldRefiningController } from './gold-refining.controller.js';
import { GoldRefiningService } from './gold-refining.service.js';

@Module({
 imports:[JwtModule.register({secret:process.env.JWT_SECRET,signOptions:{expiresIn:86400}})],
 controllers:[GoldRefiningController],
 providers:[GoldRefiningService,JwtAuthGuard,PermissionGuard],
})
export class GoldRefiningModule {}
