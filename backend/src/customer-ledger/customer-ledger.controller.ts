import { LedgerLayoutService, SaveLedgerLayoutDto } from './ledger-layout.service.js';
import { MonthlyBalanceService } from './monthly-balance.service.js';
import { DailyGoldQueryDto } from './dto/daily-gold-query.dto.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CustomerLedgerService } from './customer-ledger.service.js';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto.js';
import { UpdateLedgerEntryDto } from './dto/update-ledger-entry.dto.js';
import { QueryLedgerDto } from './dto/query-ledger.dto.js';
import { ReverseLedgerEntryDto } from './dto/reverse-ledger-entry.dto.js';

type AuthRequest = Request & { user: { sub: string; username: string } };

@ApiTags('Customer Ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('customer-ledger')
export class CustomerLedgerController {
  constructor(private readonly service: CustomerLedgerService, private readonly monthly: MonthlyBalanceService, private readonly layout: LedgerLayoutService) {}

  @Get('customer-layout')
  @RequirePermissions('customer_ledger.read')
  async customerLayout() { return { data: await this.layout.read() }; }

  @Patch('customer-layout')
  @RequirePermissions('customer_ledger.update')
  async saveCustomerLayout(@Body() dto: SaveLedgerLayoutDto) { return { data: await this.layout.save(dto) }; }

  @Get('daily-gold')
  @RequirePermissions('customer_ledger.read')
  dailyGold(@Query() query: DailyGoldQueryDto) {
    return this.monthly.daily(query.date, query.scope);
  }

  @Get('summary')
  @RequirePermissions('customer_ledger.read')
  @ApiOperation({
    summary: 'Tổng hợp sổ khách hàng và thống kê theo bộ lọc',
    description:
      'totals là số dư hiện tại theo toàn bộ lịch sử có hiệu lực; period_totals theo bộ lọc giao dịch. statistics được tính trước phân trang trên tập khách hàng đã lọc. pending_orders=null khi chưa có nguồn đơn hàng.',
  })
  summary(@Query() query: QueryLedgerDto) {
    return this.service.summary(query);
  }

  @Get('customers/:customerId')
  @RequirePermissions('customer_ledger.read')
  @ApiOperation({
    summary: 'Sổ giao dịch một khách hàng',
    description:
      'group_by_day=true phân trang theo ngày. daily_summaries: tổng nhận/giao theo các giao dịch đã lọc, closing_gold_g theo toàn bộ lịch sử đến cuối ngày. opening_gold_g/closing_gold_g theo from/to, không bị thay đổi bởi lọc loại giao dịch. totals là số dư hiện tại, period_totals là biến động trong kỳ.',
  })
  findByCustomer(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Query() query: QueryLedgerDto,
  ) {
    return this.service.findByCustomer(customerId, query);
  }

  @Get('customers/:customerId/print-data')
  @RequirePermissions('customer_ledger.read')
  printData(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Query() query: QueryLedgerDto,
  ) {
    // One existing read/calculation for the whole filtered report, without UI pagination.
    return this.service.findByCustomer(customerId, { ...query, page: 1, page_size: Number.MAX_SAFE_INTEGER, group_by_day: 'false' });
  }

  @Post('customers/:customerId/entries')
  @RequirePermissions('customer_ledger.create')
  @ApiOperation({ summary: 'Ghi giao dịch mới' })
  create(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() dto: CreateLedgerEntryDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.create(customerId, dto, req.user.sub);
  }

  @Get('entries/:id')
  @RequirePermissions('customer_ledger.read')
  @ApiOperation({
    summary: 'Chi tiết giao dịch',
    description:
      'Kèm gold_debt_before_g, gold_debt_change_g, gold_debt_running_balance_g tính theo cùng thứ tự businessDate/occurredAt/id với sổ chi tiết, kể cả khi giao dịch nằm ngoài trang đang xem.',
  })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch('entries/:id')
  @RequirePermissions('customer_ledger.update')
  @ApiOperation({ summary: 'Sửa giao dịch chưa reverse' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLedgerEntryDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, dto, req.user.sub);
  }

  @Delete('entries/:id')
  @RequirePermissions('customer_ledger.reverse')
  @ApiOperation({ summary: 'Xóa vĩnh viễn giao dịch' })
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReverseLedgerEntryDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.remove(id, req.user.sub, dto);
  }
}
