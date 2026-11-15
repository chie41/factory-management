import { Type } from 'class-transformer';
import {
  IsDefined,
  IsISO8601,
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
import { ProductionDefinitionDto } from '../catalog/production-workflow.dto.js';

export class BatchQueryDto {
  @IsOptional() @IsString() @MaxLength(180) q?: string;
  @IsOptional() @IsUUID() design_model_id?: string;
  @IsOptional()
  @IsIn(['DRAFT', 'PLANNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'])
  status?: string;
  @IsOptional()
  @IsIn([
    'created_at',
    'code',
    'planned_quantity',
    'planned_start',
    'planned_end',
    'status',
  ])
  sort = 'created_at';
  @IsOptional() @IsIn(['asc', 'desc']) direction = 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
}
export class BatchPlanDto {
  @IsOptional() @IsISO8601({ strict: true }) planned_start_at?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) planned_end_at?: string | null;
  @IsInt() @Min(1) @Max(2147483647) planned_quantity!: number;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) planned_start?:
    string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) planned_end?:
    string | null;
  @IsOptional() @IsString() @MaxLength(10000) note?: string | null;
}
export class CreateBatchDto extends BatchPlanDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductionDefinitionDto)
  workflow?: ProductionDefinitionDto;
  @IsUUID() request_id!: string;
  @IsUUID() design_model_id!: string;
  @IsString() @Matches(/\S/) source_version!: string;
}
export class UpdateBatchDto extends BatchPlanDto {
  @IsString() @Matches(/\S/) version!: string;
}
export class UpdateBatchWorkflowDto {
  @IsString() @Matches(/\S/) version!: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => ProductionDefinitionDto)
  workflow!: ProductionDefinitionDto;
}
export class ChangeBatchStatusDto {
  @IsString() @Matches(/\S/) version!: string;
  @IsIn(['DRAFT', 'PLANNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'])
  status!: string;
  @IsString() @Matches(/\S/) @MaxLength(1000) reason!: string;
}
