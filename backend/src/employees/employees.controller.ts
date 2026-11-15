import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { EmployeesService } from './employees.service.js';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  QueryEmployeesDto,
} from './dto/employee.dto.js';

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}
  @Get()
  @RequirePermissions('employees.read')
  @ApiOperation({
    summary: 'Danh sách, tìm kiếm theo mã/tên/điện thoại nhân viên',
  })
  findAll(@Query() query: QueryEmployeesDto) {
    return this.employees.findAll(query);
  }

  @Get(':id/account')
  @RequirePermissions('employees.read', 'users.create')
  accountAvailability(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.accountAvailability(id);
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  @ApiOkResponse({ description: 'Hồ sơ bao gồm code do backend sinh, chỉ đọc' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.findOne(id);
  }

  @Post()
  @RequirePermissions('employees.create')
  @ApiOperation({
    summary: 'Tạo nhân viên; backend tự sinh NV000001, không nhận mã từ client',
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string', example: 'NV000001', readOnly: true },
            name: { type: 'string' },
          },
        },
      },
    },
  })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('employees.update')
  @ApiOperation({ summary: 'Cập nhật nhân viên; mã không được thay đổi' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(id, dto);
  }
}
