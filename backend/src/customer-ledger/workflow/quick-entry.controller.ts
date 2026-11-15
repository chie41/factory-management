import { CustomerLaborPricesService } from '../../customers/customer-labor-prices.service.js';
import { EffectiveLaborPricesDto } from '../../customers/dto/customer-labor-price.dto.js';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { QuickEntryService } from './quick-entry.service.js';
import { QuickBatchDto, QuickUpdateDto } from './quick-entry.dto.js';
@Controller('customer-ledger/quick-entries')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class QuickEntryController {
  constructor(private readonly service: QuickEntryService, private readonly prices: CustomerLaborPricesService) {}
  @Post('labor-prices') @RequirePermissions('customer_ledger.create')
  effectivePrices(@Body() dto: EffectiveLaborPricesDto) { return this.prices.effective(dto.customer_id,dto.model_ids); }
  @Get('options') @RequirePermissions('customer_ledger.create') options(
    @Req() req: { user: { sub: string } },
    @Query('kind') kind: string,
    @Query('q') q?: string,
  ) {
    return this.service.options(req.user.sub, kind, q);
  }
  @Post() @RequirePermissions('customer_ledger.create') save(
    @Body() dto: QuickBatchDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.service.save(dto, req.user.sub);
  }
  @Post(':id/resubmit')
  @RequirePermissions('customer_ledger.create', 'customer_ledger.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuickUpdateDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.service.save(dto, req.user.sub, id, dto.version);
  }
}
