import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
 GoldCreateDto, GoldDefaultTemplateDto, GoldFinalizeDto, GoldMonthDto,
 GoldReloadDto, GoldReopenDto, GoldSaveDto,
} from './gold-refining.dto.js';
import { GoldRefiningService } from './gold-refining.service.js';
type Actor={user:{sub:string}};
@Controller('gold-refining')
@UseGuards(JwtAuthGuard,PermissionGuard)
export class GoldRefiningController {
 constructor(private readonly service:GoldRefiningService){}
 @Get('sessions')
 @RequirePermissions('gold.sessions.read')
 list(@Query() query:GoldMonthDto){return this.service.list(query.month)}
 @Get('sessions/by-date/:date')
 @RequirePermissions('gold.sessions.read')
 byDate(@Param('date') date:string){return this.service.byDate(date)}
 @Get('sessions/:id')
 @RequirePermissions('gold.sessions.read')
 detail(@Param('id',ParseUUIDPipe) id:string){return this.service.detail(id)}
 @Post('sessions')
 @RequirePermissions('gold.sessions.edit')
 create(@Body() dto:GoldCreateDto,@Req() actor:Actor){return this.service.create(dto.date,actor.user.sub)}
 @Patch('sessions/:id')
 @RequirePermissions('gold.sessions.edit')
 save(@Param('id',ParseUUIDPipe) id:string,@Body() dto:GoldSaveDto,@Req() actor:Actor){
  return this.service.save(id,dto,actor.user.sub);
 }
 @Post('sessions/:id/reload')
 @RequirePermissions('gold.sessions.edit')
 reload(@Param('id',ParseUUIDPipe) id:string,@Body() dto:GoldReloadDto,@Req() actor:Actor){
  return this.service.reload(id,dto.version,actor.user.sub);
 }
 @Post('sessions/:id/finalize')
 @RequirePermissions('gold.sessions.finalize')
 finalize(@Param('id',ParseUUIDPipe) id:string,@Body() dto:GoldFinalizeDto,@Req() actor:Actor){
  return this.service.finalize(id,dto.version,actor.user.sub,dto.lockAfterHours);
 }
 @Post('sessions/:id/reopen')
 @RequirePermissions('gold.sessions.reopen')
 reopen(@Param('id',ParseUUIDPipe) id:string,@Body() dto:GoldReopenDto,@Req() actor:Actor){
  return this.service.reopen(id,dto.version,actor.user.sub,dto.reason);
 }
 @Get('templates/effective')
 @RequirePermissions('gold.sessions.read')
 template(@Query('date') date:string){return this.service.template(date)}
 @Patch('templates/default')
 @RequirePermissions('gold.templates.manage')
 saveTemplate(@Body() dto:GoldDefaultTemplateDto,@Req() actor:Actor){
  return this.service.saveTemplate(dto.effectiveFrom,dto.template,actor.user.sub);
 }
}
