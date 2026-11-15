import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export const TRANSACTION_TYPES = [
  'RETURN_GOLD',
  'RETURN_GOODS',
  'RETURN_RECOVERED_GOLD',
  'DELIVERY',
  'GOLD_RETURN_TO_CUSTOMER',
] as const;

const DECIMAL = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;

export class CreateLedgerEntryDto {
  @ApiProperty({
    example: '2026-10-10',
    description: 'Ngày nghiệp vụ YYYY-MM-DD',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  business_date!: string;

  @ApiProperty({ example: '2026-10-10T08:30:00.000Z' })
  @IsDateString()
  occurred_at!: string;

  @ApiProperty({ enum: TRANSACTION_TYPES, example: 'RETURN_GOLD' })
  @IsIn(TRANSACTION_TYPES)
  transaction_type!: (typeof TRANSACTION_TYPES)[number];

  @ApiProperty({ type: String, example: '5.2500' })
  @IsString()
  @Matches(DECIMAL)
  gold_weight_g!: string;

  @IsOptional() @IsString() @Matches(DECIMAL) actual_weight_g?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) purity_percent?: string;
  @IsUUID() request_id!: string;

  @ApiPropertyOptional({ type: String, example: '0' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL)
  labor_amount_due?: string;

  @ApiPropertyOptional({ type: String, example: '0' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL)
  labor_amount_paid?: string;

  @ApiPropertyOptional({ enum: ['THB', 'LAK', 'VND'], example: 'THB' })
  @IsOptional()
  @IsIn(['THB', 'LAK', 'VND'])
  labor_currency?: 'THB' | 'LAK' | 'VND';

  @ApiPropertyOptional({ enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'] })
  @IsOptional()
  @IsIn(['UNPAID', 'PARTIALLY_PAID', 'PAID'])
  labor_payment_status?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

  @ApiPropertyOptional({ example: 'MANUAL' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  reference_type?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reference_id?: string;

  @ApiPropertyOptional({ example: 'Khách trả vàng' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
