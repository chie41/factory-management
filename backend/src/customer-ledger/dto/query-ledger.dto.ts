import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, IsIn, IsDateString, Matches } from 'class-validator';

export class QueryLedgerDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, name: 'page_size' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  page_size: number = 20;

  @ApiPropertyOptional({ description: 'Tìm mã/tên khách hàng' })
  @IsOptional() @IsString()
  q?: string;

  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] }) @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
  @ApiPropertyOptional({ enum: ['any', 'debt', 'gold', 'labor', 'clear'] }) @IsOptional() @IsIn(['any', 'debt', 'gold', 'labor', 'clear'])
  debt?: string;
  @ApiPropertyOptional({ enum: ['all', 'with_transactions', 'without_transactions'] }) @IsOptional() @IsIn(['all', 'with_transactions', 'without_transactions'])
  customer_scope?: string;
  @ApiPropertyOptional({ enum: ['DELIVERY', 'GOLD_RETURN_TO_CUSTOMER', 'RETURN_GOLD', 'RETURN_GOODS', 'RETURN_RECOVERED_GOLD'] })
  @IsOptional() @IsIn(['DELIVERY', 'GOLD_RETURN_TO_CUSTOMER', 'RETURN_GOLD', 'RETURN_GOODS', 'RETURN_RECOVERED_GOLD'])
  transaction_type?: string;
  @ApiPropertyOptional({ enum: ['all', 'active', 'reversed'] }) @IsOptional() @IsIn(['all', 'active', 'reversed'])
  reversed?: string;
  @ApiPropertyOptional({ enum: ['PAID', 'UNPAID', 'PARTIALLY_PAID'] }) @IsOptional() @IsIn(['PAID', 'UNPAID', 'PARTIALLY_PAID'])
  labor_status?: string;
  @ApiPropertyOptional({ description: 'Mã tiền tệ tiền công' }) @IsOptional() @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Phân trang theo ngày để không cắt nhóm giao dịch' }) @IsOptional() @IsIn(['true', 'false'])
  group_by_day?: string;
}
