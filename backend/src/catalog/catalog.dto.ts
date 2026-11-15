import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
const DECIMAL = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
export class CatalogQuery {
  @IsOptional() @IsUUID() group_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 10;
  @IsOptional() @IsString() @MaxLength(180) q?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}
export class DesignDto {
  @IsOptional() @IsUUID() group_id?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BomItemDto)
  initial_bom_items?: BomItemDto[];
  @IsString() @Matches(/\S/) @MaxLength(180) name!: string;
  @IsIn(['ACTIVE', 'INACTIVE']) status!: string;
  @ValidateIf((_o, v) => v != null)
  @IsString()
  @Matches(DECIMAL)
  default_labor_price_per_15g?: string | null;
  @IsOptional() @IsIn(['THB', 'LAK', 'VND']) default_labor_currency?:
    string | null;
  @IsOptional()
  @IsString()
  @Matches(/^catalog-images\/[0-9a-f-]{36}$/)
  image_url?: string | null;
  @ValidateIf((_o, v) => v != null) @IsString() @Matches(DECIMAL) weight_g?:
    string | null;
  @IsOptional() @IsString() @MaxLength(10000) design_description?:
    string | null;
  @IsOptional() @IsString() @MaxLength(10000) note?: string | null;
}
export class UpdateDesignDto extends DesignDto {
  @IsString() @Matches(/\S/) version!: string;
}
export class StatusDto {
  @IsIn(['ACTIVE', 'INACTIVE']) status!: string;
  @IsString() @Matches(/\S/) version!: string;
}
export class ComponentDto {
  @IsIn(['ACTIVE', 'INACTIVE']) status = 'ACTIVE';
  @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
  @IsOptional()
  @IsString()
  @Matches(/^catalog-images\/[0-9a-f-]{36}$/)
  image_url?: string | null;
  @IsString() @Matches(/\S/) @MaxLength(180) name!: string;
  @ValidateIf((_o, v) => v != null) @IsString() @Matches(DECIMAL) weight_g?:
    string | null;
  @ValidateIf((_o, v) => v != null) @IsString() @Matches(DECIMAL) length_mm?:
    string | null;
  @ValidateIf((_o, v) => v != null) @IsString() @Matches(DECIMAL) width_mm?:
    string | null;
  @ValidateIf((_o, v) => v != null) @IsString() @Matches(DECIMAL) height_mm?:
    string | null;
  @IsOptional() @IsObject() attributes?: Record<string, unknown> | null;
}
export class UpdateComponentDto extends ComponentDto {
  @IsString() @Matches(/\S/) version!: string;
}
export class DesignGroupDto {
  @ValidateIf((_o, v) => v != null) @IsString() @Matches(DECIMAL)
  default_labor_price_per_15g?: string | null;
  @IsString() @Matches(/\S/) @MaxLength(180) name!: string;
}
export class UpdateDesignGroupDto extends DesignGroupDto {
  @IsString() @Matches(/\S/) version!: string;
}
export class BomItemDto {
  @IsOptional() @IsUUID() id?: string;
  @IsIn(['COMPONENT', 'AUX_MATERIAL']) item_type!: string;
  @IsOptional() @IsUUID() component_id?: string | null;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(180) name_snapshot?:
    string | null;
  @ValidateIf((_o, v) => v != null) @IsString() @Matches(DECIMAL) quantity?:
    string | null;
  @ValidateIf((_o, v) => v != null) @IsString() @Matches(DECIMAL) weight_g?:
    string | null;
  @IsOptional() @IsIn(['PCS', 'G', 'CM']) unit?: string | null;
}
export class BomDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BomItemDto)
  items!: BomItemDto[];
}
export class UpdateBomDto extends BomDto {
  @IsString() @Matches(/\S/) version!: string;
}
