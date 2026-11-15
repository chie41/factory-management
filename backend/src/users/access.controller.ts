import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { AccessService } from './access.service.js';
import {
  NamedDto,
  UpdateNamedDto,
  PermissionIdsDto,
  VersionDto,
} from './dto/rbac.dto.js';
type Actor = { user: { sub: string } };
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionsController {
  constructor(private readonly access: AccessService) {}
  @Get() @RequirePermissions('users.read') list() {
    return this.access.catalog();
  }
  @Get('catalog') @RequirePermissions('users.read') catalog() {
    return this.access.catalog();
  }
}
@Controller('groups')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class GroupsController {
  constructor(private readonly access: AccessService) {}
  @Get() @RequirePermissions('users.read') list() {
    return this.access.list('groups');
  }
  @Post() @RequirePermissions('groups.manage') create(
    @Body() dto: NamedDto,
    @Req() req: Actor,
  ) {
    return this.access.create('groups', dto, req.user.sub);
  }
  @Get(':id') @RequirePermissions('users.read') async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.access.detail('groups', id) };
  }
  @Get(':id/members') @RequirePermissions('users.read') async members(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: (await this.access.detail('groups', id)).members };
  }
  @Patch(':id') @RequirePermissions('users.read') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateNamedDto,
    @Req() req: Actor,
  ) {
    return this.access.update('groups', id, dto, req.user.sub);
  }
  @Put(':id/permissions')
  @RequirePermissions('groups.permissions.manage')
  permissions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PermissionIdsDto,
    @Req() req: Actor,
  ) {
    return this.access.permissions('groups', id, dto, req.user.sub);
  }
  @Delete(':id') @RequirePermissions('groups.manage') remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VersionDto,
    @Req() req: Actor,
  ) {
    return this.access.remove('groups', id, dto, req.user.sub);
  }
}
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly access: AccessService) {}
  @Get() @RequirePermissions('users.read') list() {
    return this.access.list('roles');
  }
  @Post() @RequirePermissions('roles.manage') create(
    @Body() dto: NamedDto,
    @Req() req: Actor,
  ) {
    return this.access.create('roles', dto, req.user.sub);
  }
  @Get(':id') @RequirePermissions('users.read') async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.access.detail('roles', id) };
  }
  @Get(':id/members') @RequirePermissions('users.read') async members(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: (await this.access.detail('roles', id)).members };
  }
  @Patch(':id') @RequirePermissions('users.read') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateNamedDto,
    @Req() req: Actor,
  ) {
    return this.access.update('roles', id, dto, req.user.sub);
  }
  @Put(':id/permissions')
  @RequirePermissions('roles.permissions.manage')
  permissions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PermissionIdsDto,
    @Req() req: Actor,
  ) {
    return this.access.permissions('roles', id, dto, req.user.sub);
  }
  @Delete(':id') @RequirePermissions('roles.manage') remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VersionDto,
    @Req() req: Actor,
  ) {
    return this.access.remove('roles', id, dto, req.user.sub);
  }
}
