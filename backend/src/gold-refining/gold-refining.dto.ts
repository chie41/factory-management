import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export class GoldDateDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
}
export class GoldMonthDto {
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])$/) month!: string;
}
export class GoldVersionDto {
  @IsInt() @Min(1) version!: number;
}
export class GoldCreateDto extends GoldDateDto {}
export class GoldScaleRowDto {
  @IsString() box!: string;
  @IsString() gross!: string;
}
export class GoldAmountRowDto {
  @IsString() name!: string;
  @IsString() unit!: string;
  @IsString() count!: string;
}
export class GoldOtherRowDto {
  @IsString() name!: string;
  @IsString() add!: string;
  @IsString() subtract!: string;
}
export class GoldManualDto {
  @IsArray() @ValidateNested({each:true}) @Type(()=>GoldScaleRowDto) scales!: GoldScaleRowDto[];
  @IsArray() @ValidateNested({each:true}) @Type(()=>GoldAmountRowDto) bags!: GoldAmountRowDto[];
  @IsArray() @ValidateNested({each:true}) @Type(()=>GoldAmountRowDto) labels!: GoldAmountRowDto[];
  @IsArray() @ValidateNested({each:true}) @Type(()=>GoldOtherRowDto) others!: GoldOtherRowDto[];
}
export class GoldBoxDto {
  @IsString() id!: string;
  @IsString() name!: string;
  @IsString() tareG!: string;
}
export class GoldTemplateDto {
  @IsArray() @ValidateNested({each:true}) @Type(()=>GoldBoxDto) boxes!: GoldBoxDto[];
  @IsArray() @IsString({each:true}) bagWeights!: string[];
  @IsArray() @IsString({each:true}) labelWeights!: string[];
}
export class GoldSaveDto extends GoldVersionDto {
  @IsObject() @ValidateNested() @Type(()=>GoldManualDto) manual!: GoldManualDto;
  @IsArray() @IsString({each:true}) selectedWorkIds!: string[];
  @IsObject() @ValidateNested() @Type(()=>GoldTemplateDto) layout!: GoldTemplateDto;
}
export class GoldReloadDto extends GoldVersionDto {}
export class GoldFinalizeDto extends GoldVersionDto {
  @IsOptional() @IsInt() @Min(0) @Max(168) lockAfterHours?: number;
}
export class GoldReopenDto extends GoldVersionDto {
  @IsString() reason!: string;
}
export class GoldDefaultTemplateDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @IsObject() @ValidateNested() @Type(()=>GoldTemplateDto) template!: GoldTemplateDto;
}
