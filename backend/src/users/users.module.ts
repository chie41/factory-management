import { AccessService } from './access.service.js';
import {
  GroupsController,
  RolesController,
  PermissionsController,
} from './access.controller.js';

import 'dotenv/config';

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';

const jwtSecret = process.env['JWT_SECRET'];

if (!jwtSecret) {
  throw new Error(
    'JWT_SECRET phải có giá trị trong biến môi trường. Vui lòng kiểm tra file .env hoặc cấu hình môi trường của bạn.',
  );
}

@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret,
      signOptions: {
        expiresIn: 86400,
      },
    }),
  ],
  controllers: [
    UsersController,
    GroupsController,
    RolesController,
    PermissionsController,
  ],
  providers: [UsersService, AccessService, JwtAuthGuard, PermissionGuard],
})
export class UsersModule {}
