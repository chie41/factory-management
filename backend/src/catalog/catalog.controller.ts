import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CatalogService } from './catalog.service.js';
import {
  BomDto,
  CatalogQuery,
  ComponentDto,
  DesignDto,
  DesignGroupDto,
  UpdateDesignGroupDto,
  StatusDto,
  UpdateBomDto,
  UpdateComponentDto,
  UpdateDesignDto,
} from './catalog.dto.js';
import { VersionDto } from '../customer-ledger/workflow/workflow.dto.js';
type Actor = { user: { sub: string } };
@Controller('design-models')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DesignsController {
  constructor(private readonly service: CatalogService) {}
  @Get() @RequirePermissions('design_models.read') list(
    @Query() q: CatalogQuery,
  ) {
    return this.service.list('design_models', q);
  }
  @Post() @RequirePermissions('design_models.create') create(
    @Body() dto: DesignDto,
    @Req() req: Actor,
  ) {
    return this.service.saveDesign(dto, req.user.sub);
  }
  @Post('images')
  @RequirePermissions('design_models.create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @UploadedFile() file: { buffer: Buffer; size: number },
    @Req() req: Actor,
  ) {
    return this.service.upload(file, req.user.sub, 'design_models.create');
  }
  @Post(':id/images')
  @RequirePermissions('design_models.update')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async uploadUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; size: number },
    @Req() req: Actor,
  ) {
    await this.service.detail('design_models', id);
    return this.service.upload(file, req.user.sub, 'design_models.update');
  }
  @Get(':id') @RequirePermissions('design_models.read') async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.detail('design_models', id) };
  }
  @Patch(':id') @RequirePermissions('design_models.update') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDesignDto,
    @Req() req: Actor,
  ) {
    return this.service.saveDesign(dto, req.user.sub, id);
  }
  @Patch(':id/status') @RequirePermissions('design_models.update') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @Req() req: Actor,
  ) {
    return this.service.status(id, dto, req.user.sub);
  }
  @Delete(':id') @RequirePermissions('design_models.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Actor,
  ) {
    return this.service.remove('design_models', id, dto.version, req.user.sub);
  }
  @Get(':id/boms') @RequirePermissions('design_models.read') boms(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.boms(id);
  }
  @Post(':id/boms') @RequirePermissions('boms.manage') createBom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BomDto,
    @Req() req: Actor,
  ) {
    return this.service.saveBom(id, dto, req.user.sub);
  }
}
@Controller('components')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ComponentsController {
  constructor(private readonly service: CatalogService) {}
  @Post('images')
  @RequirePermissions('components.create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @UploadedFile() file: { buffer: Buffer; size: number },
    @Req() req: Actor,
  ) {
    return this.service.upload(file, req.user.sub, 'components.create');
  }
  @Post(':id/images')
  @RequirePermissions('components.update')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async uploadUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; size: number },
    @Req() req: Actor,
  ) {
    await this.service.detail('components', id);
    return this.service.upload(file, req.user.sub, 'components.update');
  }
  @Patch(':id/status') @RequirePermissions('components.update') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @Req() req: Actor,
  ) {
    return this.service.status(id, dto, req.user.sub, 'components');
  }
  @Get() @RequirePermissions('components.read') list(@Query() q: CatalogQuery) {
    return this.service.list('components', q);
  }
  @Get(':id') @RequirePermissions('components.read') async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.detail('components', id) };
  }
  @Post() @RequirePermissions('components.create') create(
    @Body() dto: ComponentDto,
    @Req() req: Actor,
  ) {
    return this.service.saveComponent(dto, req.user.sub);
  }
  @Patch(':id') @RequirePermissions('components.update') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComponentDto,
    @Req() req: Actor,
  ) {
    return this.service.saveComponent(dto, req.user.sub, id);
  }
  @Delete(':id') @RequirePermissions('components.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Actor,
  ) {
    return this.service.remove('components', id, dto.version, req.user.sub);
  }
}
@Controller('design-model-groups')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DesignGroupsController {
  constructor(private readonly service: CatalogService) {}
  @Get() @RequirePermissions('design_models.read') list(
    @Query() q: CatalogQuery,
  ) {
    return this.service.groups(q);
  }
  @Get(':id') @RequirePermissions('design_models.read') async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.group(id) };
  }
  @Post() @RequirePermissions('design_models.groups.manage') create(
    @Body() dto: DesignGroupDto,
    @Req() req: Actor,
  ) {
    return this.service.saveGroup(dto, req.user.sub);
  }
  @Patch(':id') @RequirePermissions('design_models.groups.manage') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDesignGroupDto,
    @Req() req: Actor,
  ) {
    return this.service.saveGroup(dto, req.user.sub, id);
  }
  @Delete(':id') @RequirePermissions('design_models.groups.manage') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Actor,
  ) {
    return this.service.removeGroup(id, dto.version, req.user.sub);
  }
}
@Controller('boms')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BomsController {
  constructor(private readonly service: CatalogService) {}
  @Get(':id') @RequirePermissions('design_models.read') async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.bom(id) };
  }
  @Patch(':id') @RequirePermissions('boms.manage') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomDto,
    @Req() req: Actor,
  ) {
    return this.service.saveBom(undefined, dto, req.user.sub, id);
  }
}
@Controller('catalog-images')
@UseGuards(JwtAuthGuard)
export class CatalogImagesController {
  constructor(private readonly service: CatalogService) {}
  @Get(':id')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, max-age=3600')
  image(@Param('id', ParseUUIDPipe) id: string, @Req() req: Actor) {
    return this.service.image(id, req.user.sub);
  }
}
