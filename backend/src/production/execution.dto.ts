import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export class ExecutionRequestDto {
  @IsUUID() request_id!: string;
  @IsString() @Matches(/\S/) version!: string;
}
export class WorkGoldDto extends ExecutionRequestDto {
  @IsUUID() employee_id!: string;
  @IsInt() @Min(0) @Max(2147483647) quantity!: number;
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  gold_weight_g!: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  labor_rate_per_15g?: string;
  @IsOptional() @IsIn(['THB', 'VND', 'LAK']) currency?: string;
  @IsOptional() @IsIn(['RATE', 'AMOUNT']) pricing_mode?: 'RATE' | 'AMOUNT';
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  planned_labor?: string;
  @IsOptional() @IsString() @MaxLength(10000) note?: string;
}
export class GoldReceiptDto extends ExecutionRequestDto {
  @IsUUID() employee_id!: string;
  @IsIn(['ADDITIONAL', 'RECEIVE']) mode!: string;
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  gold_weight_g!: string;
  @IsInt() @Min(0) @Max(2147483647) completed_quantity!: number;
  @IsOptional() @IsString() @MaxLength(10000) note?: string;
}
export class StageActionDto extends ExecutionRequestDto {
  @IsIn(['START', 'PAUSE', 'RESUME', 'COMPLETE']) action!: string;
  @IsString() @Matches(/\S/) @MaxLength(1000) reason!: string;
}
export class AssignmentDto extends ExecutionRequestDto {
  @IsIn(['SET', 'ADD']) quantity_mode = 'SET';
  @IsUUID() employee_id!: string;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) planned_quantity?:
    number | null;
  @IsIn(['ACTIVE', 'COMPLETED', 'CANCELLED']) status = 'ACTIVE';
  @IsISO8601({ strict: true }) assigned_at!: string;
  @IsOptional() @IsString() @MaxLength(10000) note?: string;
}
export class OutputDto extends ExecutionRequestDto {
  @IsString() @Matches(/\S/) @MaxLength(160) work_reference!: string;
  @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  assignment_ids!: string[];
  @IsISO8601({ strict: true }) occurred_at!: string;
  @IsOptional() @IsString() @MaxLength(10000) note?: string;
}
export class MaterialIdentityDto {
  @IsIn(['GOLD', 'SILVER', 'GEM', 'OTHER']) material_type!: string;
  @IsString() @Matches(/\S/) @MaxLength(120) material_name!: string;
  @IsIn(['G', 'PCS', 'CARAT']) unit!: string;
}
export class MaterialDto extends ExecutionRequestDto {
  @IsUUID() employee_id!: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => MaterialIdentityDto)
  material!: MaterialIdentityDto;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/) quantity!: string;
  @IsIn([
    'INITIAL',
    'ADDITIONAL',
    'RETURN_UNUSED',
    'RETURN_TOTAL',
    'RECEIVE_PRODUCT',
  ])
  kind!: string;
  @IsISO8601({ strict: true }) occurred_at!: string;
  @IsOptional() @IsString() @MaxLength(10000) note?: string;
}
export class ReconcileDto extends ExecutionRequestDto {
  @IsUUID() employee_id!: string;
  @IsIn(['CLOSE', 'REOPEN']) action!: string;
  @IsString() @Matches(/\S/) @MaxLength(10000) reason!: string;
  @IsDefined() @IsBoolean() materials_reviewed!: boolean;
}
export class MaterialTransferDto extends MaterialDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,80}$/) to_step_id!: string;
  @IsUUID() to_employee_id!: string;
}
export class MaterialReverseDto extends ExecutionRequestDto {
  @IsUUID() movement_id!: string;
  @IsString() @Matches(/\S/) @MaxLength(1000) reason!: string;
}
export class LossDto extends ExecutionRequestDto {
  @IsUUID() employee_id!: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => MaterialIdentityDto)
  material!: MaterialIdentityDto;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/) quantity!: string;
  @IsIn(['INCREASE', 'DECREASE']) direction!: string;
  @IsOptional() @IsUUID() adjusts_id?: string;
  @IsISO8601({ strict: true }) occurred_at!: string;
  @IsString() @Matches(/\S/) @MaxLength(10000) reason!: string;
}
export class LaborDto extends ExecutionRequestDto {
  @IsUUID() employee_id!: string;
  @IsOptional() @IsUUID() output_id?: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/) amount!: string;
  @IsIn(['INCREASE', 'DECREASE']) direction!: string;
  @IsOptional() @IsUUID() adjusts_id?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  rate_per_15g?: string | null;
  @IsISO8601({ strict: true }) occurred_at!: string;
  @IsString() @Matches(/\S/) @MaxLength(10000) calculation_note!: string;
}

export class TransactionChangeDto extends ExecutionRequestDto {
  @IsString() @Matches(/\S/) transaction_version!: string;
  @IsString() @Matches(/\S/) @MaxLength(10000) reason!: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) quantity?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) completed_quantity?: number;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  gold_weight_g?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  labor_rate_per_15g?: string;
  @IsOptional() @IsIn(['THB', 'VND', 'LAK']) currency?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  planned_labor?: string;
  @IsOptional() @IsIn(['RATE', 'AMOUNT']) pricing_mode?: 'RATE' | 'AMOUNT';
}

export class TransactionDeleteDto extends ExecutionRequestDto {
  @IsString() @Matches(/\S/) transaction_version!: string;
}
