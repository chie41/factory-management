import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { ExcelImportService } from './excel-import.service.js';
import { ConfirmExcelDto, PreviewExcelDto } from './excel-import.dto.js';
@Controller('customer-ledger/excel-import')
@UseGuards(JwtAuthGuard,PermissionGuard)
export class ExcelImportController {
 constructor(private readonly service: ExcelImportService) {}
 @Post('preview') @RequirePermissions('customer_ledger.create')
 preview(@Body() dto:PreviewExcelDto,@Req() req:{user:{sub:string}}) {return this.service.preview(dto,req.user.sub);}
 @Post('confirm') @RequirePermissions('customer_ledger.create')
 confirm(@Body() dto:ConfirmExcelDto,@Req() req:{user:{sub:string}}) {return this.service.confirm(dto,req.user.sub);}
}
