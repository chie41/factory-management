import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
export class EditRowDto {
 @IsString() sheet!: string;
 @IsInt() @Min(1) row!: number;
 @IsArray() @ArrayMaxSize(19) @IsString({each:true}) cells!: string[];
}
export class SplitRowDto {
 @IsString() sheet!: string;
 @IsInt() @Min(1) row!: number;
}
export class PreviewExcelDto {
 @IsString() @MaxLength(6000000) file_base64!: string;
 @IsString() @MaxLength(255) file_name!: string;
 @IsBoolean() bulk!: boolean;
 @IsOptional() @IsUUID() customer_id?: string;
 @IsOptional() @IsArray() @ArrayMaxSize(10000) @ValidateNested({each:true}) @Type(()=>EditRowDto) edits?: EditRowDto[];
 @IsOptional() @IsArray() @ArrayMaxSize(10000) @ValidateNested({each:true}) @Type(()=>SplitRowDto) splits?: SplitRowDto[];
 @IsOptional() @IsArray() @ArrayMaxSize(10000) @ValidateNested({each:true}) @Type(()=>SplitRowDto) ignored_rows?: SplitRowDto[];
}
export class ModelMappingDto {
 @IsInt() @Min(1) row!: number;
 @IsUUID() model_id!: string;
}
export class GroupSelectionDto {
 @IsString() group_id!: string;
 @IsOptional() @IsUUID() customer_id?: string;
 @IsOptional() @IsString() @MaxLength(180) new_customer_name?: string;
 @IsOptional() @IsUUID() employee_id?: string;
 @IsOptional() @IsUUID() collector_id?: string;
 @IsOptional() @IsString() payment_target_group?: string;
 @IsOptional() @IsUUID() payment_target_id?: string;
 @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>ModelMappingDto) models?: ModelMappingDto[];
 // Accept older clients without requiring a manual review checkbox.
 @IsOptional() @IsBoolean() confirmed_review?: boolean;
 @IsOptional() @IsBoolean() allow_possible_duplicate?: boolean;
}
export class ConfirmExcelDto extends PreviewExcelDto {
 @IsUUID() request_id!: string;
 @IsIn(['THB']) currency!: 'THB';
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>GroupSelectionDto) selections!: GroupSelectionDto[];
}
