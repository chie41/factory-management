import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  imports: [JwtModule.register({ secret: process.env['JWT_SECRET'], signOptions: { expiresIn: 86400 } })],
  controllers: [EmployeesController], providers: [EmployeesService, JwtAuthGuard, PermissionGuard],
})
export class EmployeesModule {}
