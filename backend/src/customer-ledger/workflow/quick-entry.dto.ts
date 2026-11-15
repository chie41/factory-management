import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
const DECIMAL = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
export class QuickLineDto {
  @IsOptional() @IsUUID() source_item_id?: string;
  @IsUUID() design_model_id!: string;
  @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @IsString() @Matches(DECIMAL) unit_weight_g!: string;
  @IsString() @Matches(DECIMAL) labor_price_per_15g!: string;
}
export class QuickReceiptDto {
  @IsOptional() @IsString() @Matches(DECIMAL) confirmed_fx_per_baht?: string;
  @IsUUID() request_id!: string;
  @IsString() @Matches(DECIMAL) amount!: string;
  @IsIn(['THB', 'LAK', 'VND']) currency!: string;
  @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) received_at!: string;
  @IsUUID() employee_id!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class QuickEntryDto {
  @IsOptional() @IsUUID() order_id?: string;
  @IsOptional() @IsString() order_version?: string;
  @IsOptional() @IsUUID() trip_id?: string;
  @IsUUID() request_id!: string;
  @IsUUID() customer_id!: string;
  @IsUUID() employee_id!: string;
  @IsIn([
    'DELIVERY',
    'RETURN_GOLD',
    'GOLD_RETURN_TO_CUSTOMER',
    'RETURN_RECOVERED_GOLD',
  ])
  transaction_type!: string;
  @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) occurred_at!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) gold_weight_g?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) actual_weight_g?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) purity_percent?: string;
  @IsOptional() @IsIn(['NONE', 'PERCENT', 'AMOUNT']) discount_type?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) discount_value?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuickLineDto)
  items?: QuickLineDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => QuickReceiptDto)
  receipt?: QuickReceiptDto;
}
export class QuickBatchDto {
  @IsUUID() request_id!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuickEntryDto)
  entries!: QuickEntryDto[];
}
export class QuickUpdateDto extends QuickBatchDto {
  @IsString() version!: string;
}
