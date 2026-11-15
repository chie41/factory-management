import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Request } from 'express';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    username: string;
  };
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập và nhận JWT' })
  @ApiBody({ type: LoginDto })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me/permissions')
  @UseGuards(JwtAuthGuard)
  permissions(@Req() request: AuthenticatedRequest) {
    return this.authService.getPermissions(request.user.sub);
  }
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin tài khoản hiện tại' })
  getMe(@Req() request: AuthenticatedRequest) {
    return this.authService.getMeByUserId(request.user.sub);
  }
}
