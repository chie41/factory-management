import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
export class DuplicateCustomerNameDto {
  @IsString()
  @MaxLength(180)
  name!: string;
  @IsOptional()
  @IsUUID()
  exclude_id?: string;
}
