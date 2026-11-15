import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionGuard } from './guards/permission.guard.js';

const jwtSecret = process.env['JWT_SECRET'];

if (!jwtSecret ) {
  throw new Error(
    'JWT_SECRET phải được cấu hình trong file .env',
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
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, PermissionGuard],
})
export class AuthModule {}
