import { GroupIdDto, PermissionIdsDto, VersionDto } from './dto/rbac.dto.js';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Request } from 'express';

import { UsersService } from './users.service.js';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUsersDto } from './dto/query-users.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto.js';
import { SetUserRolesDto } from './dto/set-user-roles.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    username: string;
  };
};

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Danh sách tài khoản' })
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('eligible-employees')
  @RequirePermissions('users.read')
  eligibleEmployees() {
    return this.usersService.eligibleEmployees();
  }
  @Get(':id/effective-permissions')
  @RequirePermissions('users.read')
  async effective(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      data: (await this.usersService.findOne(id)).data.effective_permissions,
    };
  }
  @Put(':id/group')
  @RequirePermissions('users.groups.manage')
  group(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: GroupIdDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.setGroup(id, dto, req.user.sub);
  }
  @Put(':id/direct-permissions')
  @RequirePermissions('users.permissions.manage')
  direct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PermissionIdsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.setPermissions(id, dto, req.user.sub);
  }
  // Phải khai báo trước @Get(':id')
  @Get('roles')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Danh sách vai trò' })
  findRoles() {
    return this.usersService.findRoles();
  }

  @Post()
  @RequirePermissions('users.create')
  @ApiOperation({ summary: 'Tạo tài khoản' })
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.usersService.create(dto, req.user.sub);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Chi tiết tài khoản' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  @ApiOperation({ summary: 'Cập nhật tài khoản' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.update(id, dto, req.user.sub);
  }

  @Patch(':id/status')
  @RequirePermissions('users.status.manage')
  @ApiOperation({ summary: 'Khóa hoặc mở khóa tài khoản' })
  changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.changeStatus(id, dto, req.user.sub);
  }

  @Patch(':id/password')
  @RequirePermissions('users.password.reset')
  @ApiOperation({ summary: 'Đặt lại mật khẩu tài khoản' })
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetUserPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.resetPassword(id, dto, req.user.sub);
  }

  @Put(':id/roles')
  @RequirePermissions('users.roles.manage')
  @ApiOperation({ summary: 'Thay thế danh sách vai trò' })
  setRoles(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetUserRolesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.setRoles(id, dto, req.user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('users.delete')
  @ApiOperation({ summary: 'Xóa mềm tài khoản' })
  remove(
    @Body() dto: VersionDto,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.remove(id, req.user.sub, dto);
  }
}
