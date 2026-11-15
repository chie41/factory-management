import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
const DECIMAL = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
export class VersionDto {
  @IsString() @IsNotEmpty() version!: string;
}
export class OrderItemDto {
  @IsOptional() @IsUUID() design_model_id?: string;
  @IsString() @IsNotEmpty() @MaxLength(180) item_name!: string;
  @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @IsString() @Matches(DECIMAL) unit_weight_g!: string;
  @IsString() @Matches(DECIMAL) labor_price_per_15g!: string;
}
export class CreateOrderDto {
  @IsUUID() customer_id!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
export class OrderStatusDto extends VersionDto {
  @IsIn(['PREPARING', 'READY', 'AWAITING_DELIVERY_ASSIGNMENT']) status!: string;
}
export class CreateTripDto {
  @IsUUID() employee_id!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() delivery_date!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  order_ids!: string[];
  @IsOptional() @IsString() note?: string;
}
export class ReportDeliveryDto extends VersionDto {
  @IsOptional() @IsString() @Matches(DECIMAL) confirmed_fx_per_baht?: string;
  @IsOptional() @IsUUID() trip_id?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() business_date!: string;
  @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) occurred_at!: string;
  @IsIn(['NONE', 'PERCENT', 'AMOUNT']) discount_type!: string;
  @IsString() @Matches(DECIMAL) discount_value!: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Matches(DECIMAL)
  actual_received_amount?: string;
  @IsOptional() @IsIn(['THB', 'LAK', 'VND']) received_currency?: string;
  @IsOptional() @IsString() note?: string;
}
export class ApproveDeliveryDto extends VersionDto {
  @IsOptional() @IsString() @Matches(DECIMAL) confirmed_fx_per_baht?: string;
}
export class ManualDeliveryDto {
  @IsUUID() request_id!: string;
  @IsUUID() customer_id!: string;
  @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) occurred_at!: string;
  @IsString() @Matches(DECIMAL) gold_weight_g!: string;
  @IsString() @Matches(DECIMAL) original_labor_baht!: string;
  @IsIn(['NONE', 'PERCENT', 'AMOUNT']) discount_type!: string;
  @IsString() @Matches(DECIMAL) discount_value!: string;
  @IsOptional() @IsString() @Matches(DECIMAL) actual_received_amount?: string;
  @IsOptional() @IsIn(['THB', 'LAK', 'VND']) received_currency?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) confirmed_fx_per_baht?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
export class RejectDeliveryDto extends VersionDto {
  @IsString() @Matches(/\S/) @MaxLength(1000) reason!: string;
}
export class PaymentDto {
  @IsOptional() @IsString() @Matches(DECIMAL) confirmed_fx_per_baht?: string;
  @IsOptional() @IsUUID() employee_id?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsUUID() request_id!: string;
  @IsString() @Matches(DECIMAL) amount!: string;
  @IsIn(['THB', 'LAK', 'VND']) currency!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() business_date!: string;
  @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) occurred_at!: string;
}
export class ApprovePaymentDto extends VersionDto {
  @IsString() @Matches(DECIMAL) confirmed_fx_per_baht!: string;
}
export class ReviseFxDto extends ApprovePaymentDto {
  @IsString() @Matches(/\S/) @MaxLength(1000) reason!: string;
}
export class ReturnItemDto {
  @IsUUID() order_item_id!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() @Matches(DECIMAL) gold_weight_g?: string;
}
export class CreateReturnDto {
  @IsOptional() @IsString() @Matches(DECIMAL) refund_amount?: string;
  @IsOptional() @IsIn(['THB', 'LAK', 'VND']) refund_currency?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) confirmed_fx_per_baht?: string;
  @IsOptional() @IsUUID() employee_id?: string;
  @IsUUID() request_id!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() business_date!: string;
  @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) occurred_at!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
  @IsOptional() @IsString() note?: string;
}
export class ApproveReturnDto extends VersionDto {
  @IsString() @Matches(DECIMAL) refund_amount!: string;
  @IsIn(['THB', 'LAK', 'VND']) refund_currency!: string;
  @IsString() @Matches(DECIMAL) confirmed_fx_per_baht!: string;
}
export class SplitPartDto {
  @IsUUID() order_item_id!: string;
  @IsInt() @Min(1) quantity!: number;
}
export class SplitChildDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitPartDto)
  items!: SplitPartDto[];
}
export class SplitOrderDto extends VersionDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SplitChildDto)
  children!: SplitChildDto[];
}
export class CashPeriodDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() from_date!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() to_date!: string;
  @IsOptional() @IsString() @Matches(DECIMAL) kip_per_baht?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) vnd_per_baht?: string;
}

export class DeliveryEventDto {
  @IsUUID() order_id!: string;
  @IsIn(['FAILED', 'RESCHEDULED']) event_type!: string;
  @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) occurred_at!: string;
  @IsString() @Matches(/\S/) @MaxLength(1000) note!: string;
}

export class CashPeriodFxDto extends VersionDto {
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Matches(DECIMAL)
  kip_per_baht?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Matches(DECIMAL)
  vnd_per_baht?: string;
}
