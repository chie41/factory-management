import { CustomerLaborPricesService } from './customer-labor-prices.service.js';
import { CustomerLaborPriceDto } from './dto/customer-labor-price.dto.js';
import { CatalogQuery } from '../catalog/catalog.dto.js';
import { DuplicateCustomerNameDto } from './dto/duplicate-customer-name.dto.js';

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
    Query,
    Req,
    UseGuards,
  } from '@nestjs/common';
  
  import {
    ApiBearerAuth,
    ApiOperation,
    ApiTags,
    ApiCreatedResponse,
  } from '@nestjs/swagger';
  
  import { CustomersService } from './customers.service.js';
  
  import { CreateCustomerDto } from './dto/create-customer.dto.js';
  import { UpdateCustomerDto } from './dto/update-customer.dto.js';
  import { QueryCustomersDto } from './dto/query-customers.dto.js';
  
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
  import { PermissionGuard } from '../auth/guards/permission.guard.js';
  import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
  
  @ApiTags('Customers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @Controller('customers')
  export class CustomersController {
    constructor(
      private readonly customersService: CustomersService,
      private readonly laborPrices: CustomerLaborPricesService,
    ) {}
  
    // GET /api/v1/customers
    @Get()
    @RequirePermissions('customers.read')
    @ApiOperation({
      summary: 'Danh sách, tìm kiếm và phân trang khách hàng',
    })
    findAll(@Query() query: QueryCustomersDto) {
      return this.customersService.findAll(query);
    }
  
    @Get('duplicate-names')
    @RequirePermissions('customers.read')
    duplicateNames(@Query() query: DuplicateCustomerNameDto) {
      return this.customersService.duplicateNames(query.name, query.exclude_id);
    }

    // POST /api/v1/customers
    @Post()
    @RequirePermissions('customers.create')
    @ApiOperation({
      summary: 'Tạo khách hàng; backend tự sinh KH000001, không nhận mã từ client',
    })
    @ApiCreatedResponse({ schema: { type: 'object', properties: { data: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, customerCode: { type: 'string', example: 'KH000001', readOnly: true }, name: { type: 'string' } } } } } })
    create(@Body() dto: CreateCustomerDto, @Req() req: { user: { sub: string } }) {
      return this.customersService.create(dto, req.user.sub);
    }
  
    @Get(':id/group-labor-prices') @RequirePermissions('customers.read')
    groupPrices(@Param('id', ParseUUIDPipe) id: string) { return this.laborPrices.listGroups(id); }
    @Get(':id/group-labor-prices/groups') @RequirePermissions('customers.read')
    priceGroups(@Param('id', ParseUUIDPipe) id: string, @Query() q: CatalogQuery) { return this.laborPrices.groups(id,q); }
    @Post(':id/group-labor-prices/:groupId') @RequirePermissions('customers.update')
    addGroupPrice(@Param('id', ParseUUIDPipe) id: string, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() dto: CustomerLaborPriceDto, @Req() req: {user:{sub:string}}) { return this.laborPrices.write(id,groupId,dto.labor_price_per_15g,req.user.sub,'create','group'); }
    @Patch(':id/group-labor-prices/:groupId') @RequirePermissions('customers.update')
    editGroupPrice(@Param('id', ParseUUIDPipe) id: string, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() dto: CustomerLaborPriceDto, @Req() req: {user:{sub:string}}) { return this.laborPrices.write(id,groupId,dto.labor_price_per_15g,req.user.sub,'update','group'); }
    @Delete(':id/group-labor-prices/:groupId') @RequirePermissions('customers.update') @HttpCode(HttpStatus.NO_CONTENT)
    async deleteGroupPrice(@Param('id', ParseUUIDPipe) id: string, @Param('groupId', ParseUUIDPipe) groupId: string, @Req() req: {user:{sub:string}}) { await this.laborPrices.write(id,groupId,undefined,req.user.sub,'delete','group'); }

    @Get(':id/labor-prices') @RequirePermissions('customers.read')
    prices(@Param('id', ParseUUIDPipe) id: string) { return this.laborPrices.list(id); }
    @Get(':id/labor-prices/models') @RequirePermissions('customers.read')
    priceModels(@Param('id', ParseUUIDPipe) id: string, @Query() q: CatalogQuery) { return this.laborPrices.models(id,q); }
    @Get(':id/labor-prices/:modelId/effective') @RequirePermissions('customers.read')
    effectivePrice(@Param('id', ParseUUIDPipe) id: string, @Param('modelId', ParseUUIDPipe) modelId: string) { return this.laborPrices.effective(id,[modelId]); }
    @Post(':id/labor-prices/:modelId') @RequirePermissions('customers.update')
    addPrice(@Param('id', ParseUUIDPipe) id: string, @Param('modelId', ParseUUIDPipe) modelId: string, @Body() dto: CustomerLaborPriceDto, @Req() req: {user:{sub:string}}) { return this.laborPrices.write(id,modelId,dto.labor_price_per_15g,req.user.sub,'create'); }
    @Patch(':id/labor-prices/:modelId') @RequirePermissions('customers.update')
    editPrice(@Param('id', ParseUUIDPipe) id: string, @Param('modelId', ParseUUIDPipe) modelId: string, @Body() dto: CustomerLaborPriceDto, @Req() req: {user:{sub:string}}) { return this.laborPrices.write(id,modelId,dto.labor_price_per_15g,req.user.sub,'update'); }
    @Delete(':id/labor-prices/:modelId') @RequirePermissions('customers.update') @HttpCode(HttpStatus.NO_CONTENT)
    async deletePrice(@Param('id', ParseUUIDPipe) id: string, @Param('modelId', ParseUUIDPipe) modelId: string, @Req() req: {user:{sub:string}}) { await this.laborPrices.write(id,modelId,undefined,req.user.sub,'delete'); }

    // GET /api/v1/customers/:id
    @Get(':id')
    @RequirePermissions('customers.read')
    @ApiOperation({
      summary: 'Chi tiết khách hàng',
    })
    findOne(
      @Param('id', new ParseUUIDPipe()) id: string,
    ) {
      return this.customersService.findOne(id);
    }
  
    // PATCH /api/v1/customers/:id
    @Patch(':id')
    @RequirePermissions('customers.update')
    @ApiOperation({
      summary: 'Cập nhật thông tin khách hàng',
    })
    update(
      @Param('id', new ParseUUIDPipe()) id: string,
      @Body() dto: UpdateCustomerDto,
      @Req() req: { user: { sub: string } },
    ) {
      return this.customersService.update(id, dto, req.user.sub);
    }
  
    // DELETE /api/v1/customers/:id
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequirePermissions('customers.delete')
    @ApiOperation({
      summary: 'Xóa mềm khách hàng',
    })
    remove(
      @Param('id', new ParseUUIDPipe()) id: string,
    ) {
      return this.customersService.remove(id);
    }
  }
  