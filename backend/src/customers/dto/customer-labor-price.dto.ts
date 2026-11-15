import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, Matches } from 'class-validator';
export class CustomerLaborPriceDto {
  @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  labor_price_per_15g!: string;
}
export class EffectiveLaborPricesDto {
  @IsUUID() customer_id!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID(undefined, { each: true })
  model_ids!: string[];
}
