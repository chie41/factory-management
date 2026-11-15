import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { LedgerWorkflowService } from './ledger-workflow.service.js';
import {
  CreateOrderDto,
  OrderStatusDto,
  CreateTripDto,
  ReportDeliveryDto,
  ApproveDeliveryDto,
  RejectDeliveryDto,
  PaymentDto,
  ApprovePaymentDto,
  ReviseFxDto,
  CreateReturnDto,
  ApproveReturnDto,
  SplitOrderDto,
  CashPeriodDto,
  CashPeriodFxDto,
  VersionDto,
  DeliveryEventDto,
  ManualDeliveryDto,
} from './workflow.dto.js';
type Actor = { user: { sub: string } };
@Controller('orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LedgerOrdersController {
  constructor(private readonly service: LedgerWorkflowService) {}
  @Get() @RequirePermissions('orders.read') list(
    @Query('customer_id', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return this.service.orders(customerId);
  }
  @Get(':id') @RequirePermissions('orders.read') async detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.service.order(id) };
  }
  @Post() @RequirePermissions('orders.create') create(
    @Body() dto: CreateOrderDto,
    @Req() req: Actor,
  ) {
    return this.service.createOrder(dto, req.user.sub);
  }
  @Patch(':id/status') @RequirePermissions('orders.update') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderStatusDto,
    @Req() req: Actor,
  ) {
    return this.service.orderStatus(id, dto, req.user.sub);
  }
  @Post(':id/split') @RequirePermissions('orders.split') split(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SplitOrderDto,
    @Req() req: Actor,
  ) {
    return this.service.splitOrder(id, dto, req.user.sub);
  }
}
@Controller('delivery-trips')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LedgerTripsController {
  constructor(private readonly service: LedgerWorkflowService) {}
  @Get() @RequirePermissions('delivery.manage') list() {
    return this.service.trips();
  }
  @Post(':id/events') @RequirePermissions('delivery.report') event(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliveryEventDto,
    @Req() req: Actor,
  ) {
    return this.service.deliveryEvent(id, dto, req.user.sub);
  }
  @Post() @RequirePermissions('delivery.manage') create(
    @Body() dto: CreateTripDto,
    @Req() req: Actor,
  ) {
    return this.service.createTrip(dto, req.user.sub);
  }
}
@Controller('customer-ledger')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LedgerWorkflowController {
  constructor(private readonly service: LedgerWorkflowService) {}
  @Post('manual-deliveries')
  @RequirePermissions('customer_ledger.create')
  manualDelivery(@Body() dto: ManualDeliveryDto, @Req() req: Actor) {
    return this.service.manualDelivery(dto, req.user.sub);
  }
  @Get('delivery-orders') @RequirePermissions('delivery.report') list(
    @Req() req: Actor,
    @Query('customer_id', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return this.service.deliveryOrders(customerId, req.user.sub);
  }
  @Get('returnable-deliveries')
  @RequirePermissions('customer_ledger.returns.manage')
  listReturnable(
    @Query('customer_id', new ParseUUIDPipe({ optional: true }))
    customerId?: string,
  ) {
    return this.service.returnable(customerId);
  }
  @Post('orders/:id/report-delivery')
  @RequirePermissions('delivery.report')
  report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportDeliveryDto,
    @Req() req: Actor,
  ) {
    return this.service.report(id, dto, req.user.sub);
  }
  @Post('orders/:id/record-delivery')
  @RequirePermissions('customer_ledger.create', 'delivery.report')
  recordDelivery(@Param('id', ParseUUIDPipe) id:string,@Body() dto:ReportDeliveryDto,@Req() req:Actor) {
    return this.service.recordDeliveryFromLedger(id,dto,req.user.sub);
  }
  @Get('entries/:id/workflow')
  @RequirePermissions('customer_ledger.read')
  async detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: Actor) {
    return {
      data: await this.service.visible(
        req.user.sub,
        await this.service.detail(id),
      ),
    };
  }
  @Post('entries/:id/approve')
  @RequirePermissions('customer_ledger.approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDeliveryDto,
    @Req() req: Actor,
  ) {
    return this.service.approveDelivery(id, dto, req.user.sub);
  }
  @Post('entries/:id/incorrect')
  @RequirePermissions('customer_ledger.approve')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDeliveryDto,
    @Req() req: Actor,
  ) {
    return this.service.rejectDelivery(id, dto, req.user.sub);
  }
  @Post('entries/:id/payments')
  @RequirePermissions('customer_ledger.collect')
  collect(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentDto,
    @Req() req: Actor,
  ) {
    return this.service.collect(id, dto, req.user.sub, 'LEDGER');
  }
  @Post('entries/:id/goods-returns')
  @RequirePermissions('customer_ledger.returns.manage')
  goodsReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReturnDto,
    @Req() req: Actor,
  ) {
    return this.service.createReturn(id, dto, req.user.sub, true);
  }
  @Get('goods-returns/:id')
  @RequirePermissions('customer_ledger.read')
  async returnDetail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.service.goodsReturn(id) };
  }
  @Post('goods-returns/:id/void')
  @RequirePermissions('customer_ledger.returns.manage')
  voidReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDeliveryDto,
    @Req() req: Actor,
  ) {
    return this.service.voidReturn(id, dto, req.user.sub);
  }
  @Post('goods-returns/:id/approve')
  @RequirePermissions('customer_ledger.returns.manage', 'cash.refund.approve')
  approveReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveReturnDto,
    @Req() req: Actor,
  ) {
    return this.service.approveReturn(id, dto, req.user.sub);
  }
}
@Controller('cash')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LedgerCashController {
  constructor(private readonly service: LedgerWorkflowService) {}
  @Get('transactions') @RequirePermissions('cash.read') cash() {
    return this.service.cash();
  }
  @Get('outstanding') @RequirePermissions('cash.read') outstanding() {
    return this.service.outstanding();
  }
  @Get('payments') @RequirePermissions('cash.read') async payments(
    @Req() req: Actor,
  ) {
    return {
      data: await this.service.visible(
        req.user.sub,
        (await this.service.payments()).data,
      ),
    };
  }
  @Get('payments/:id') @RequirePermissions('cash.read') async payment(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Actor,
  ) {
    return {
      data: await this.service.visible(
        req.user.sub,
        await this.service.payment(id),
      ),
    };
  }
  @Post('entries/:id/payments') @RequirePermissions('cash.collect') collect(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentDto,
    @Req() req: Actor,
  ) {
    return this.service.collect(id, dto, req.user.sub, 'CASH');
  }
  @Post('payments/:id/approve') @RequirePermissions('cash.approve') approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovePaymentDto,
    @Req() req: Actor,
  ) {
    return this.service.approvePayment(id, dto, req.user.sub);
  }
  @Post('payments/:id/void') @RequirePermissions('cash.approve') voidPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDeliveryDto,
    @Req() req: Actor,
  ) {
    return this.service.voidPayment(id, dto, req.user.sub);
  }
  @Patch('payments/:id/fx') @RequirePermissions('customer_ledger.fx.manage') fx(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviseFxDto,
    @Req() req: Actor,
  ) {
    return this.service.reviseFx(id, dto, req.user.sub);
  }
  @Get('periods') @RequirePermissions('cash.periods.manage') periods() {
    return this.service.periods();
  }
  @Post('periods') @RequirePermissions('cash.periods.manage') period(
    @Body() dto: CashPeriodDto,
    @Req() req: Actor,
  ) {
    return this.service.createPeriod(dto, req.user.sub);
  }
  @Get('periods/:id/report')
  @RequirePermissions('cash.periods.manage')
  async periodReport(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.service.periodReport(id) };
  }
  @Patch('periods/:id/fx') @RequirePermissions('cash.periods.manage') periodFx(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashPeriodFxDto,
    @Req() req: Actor,
  ) {
    return this.service.periodFx(id, dto, req.user.sub);
  }
  @Post('periods/:id/close') @RequirePermissions('cash.periods.manage') close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Actor,
  ) {
    return this.service.closePeriod(id, dto.version, req.user.sub);
  }
}
