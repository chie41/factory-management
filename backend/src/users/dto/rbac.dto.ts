import {
  IsArray,
  ArrayUnique,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  IsDefined,
  IsNotEmpty,
  ValidateIf,
  Matches,
} from 'class-validator';
export class VersionDto {
  @IsString() @IsNotEmpty() version!: string;
}
export class CreateUserDto {
  @IsString() @IsNotEmpty() @MaxLength(100) username!: string;
  @IsString()
  @MinLength(6)
  @Matches(/\S/u, { message: 'Mật khẩu không được chỉ chứa khoảng trắng' })
  @MaxLength(256)
  password!: string;
  @IsDefined() @IsUUID() employee_id!: string;
  @IsOptional() @IsIn(['ACTIVE', 'LOCKED']) status?: 'ACTIVE' | 'LOCKED';
  @IsOptional() @IsUUID() group_id?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  role_ids?: string[];
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  permission_ids?: string[];
}
export class UpdateUserDto extends VersionDto {
  @IsDefined() @IsUUID() employee_id!: string;
}
export class UpdateUserStatusDto extends VersionDto {
  @IsIn(['ACTIVE', 'LOCKED']) status!: 'ACTIVE' | 'LOCKED';
}
export class SetUserRolesDto extends VersionDto {
  @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) role_ids!: string[];
}
export class PermissionIdsDto extends VersionDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  permission_ids!: string[];
}
export class GroupIdDto extends VersionDto {
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsUUID()
  group_id!: string | null;
}
export class ResetUserPasswordDto extends VersionDto {
  @IsString()
  @MinLength(6)
  @Matches(/\S/u, { message: 'Mật khẩu không được chỉ chứa khoảng trắng' })
  @MaxLength(256)
  new_password!: string;
}
export class NamedDto {
 @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
 @ValidateIf((_object,value)=>value!==undefined) @IsArray() @ArrayUnique() @IsUUID('all',{each:true}) permission_ids?: string[];
}
export class UpdateNamedDto extends VersionDto {
 @ValidateIf((_object,value)=>value!==undefined) @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
 @ValidateIf((_object,value)=>value!==undefined) @IsArray() @ArrayUnique() @IsUUID('all',{each:true}) permission_ids?: string[];
}
