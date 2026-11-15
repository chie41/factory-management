import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { UpdateDesignGroupDto } from './catalog.dto.js';

export class ProductionStepDto {
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) estimatedDurationMinutes?:
    number | null;
  @IsOptional() @IsBoolean() requiresEmployeeConfirmation?: boolean;
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  laborRatePer15g?: string | null;
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,80}$/) id!: string;
  @IsString() @Matches(/\S/) @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  dependencies!: string[];
}
export class ProductionDefinitionDto {
  @IsOptional() @IsString() @MaxLength(180) name?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ProductionStepDto)
  steps!: ProductionStepDto[];
}
export class ProductionWorkflowDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDesignGroupDto)
  groupInfo?: UpdateDesignGroupDto;
  @IsString() @Matches(/\S/) version!: string;
  @IsIn(['SAVE', 'CUSTOMIZE', 'INHERIT']) action!:
    'SAVE' | 'CUSTOMIZE' | 'INHERIT';
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductionDefinitionDto)
  workflow?: ProductionDefinitionDto;
}
