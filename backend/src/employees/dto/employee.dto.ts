import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, Matches, IsDateString } from 'class-validator';
import { QueryCustomersDto } from '../../customers/dto/query-customers.dto.js';

export class CreateEmployeeDto {
  @ApiProperty({ maxLength: 180 })
  @IsString() @IsNotEmpty() @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  role?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({ format: 'date', example: '2026-10-12' })
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true })
  start_date?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  note?: string;
}
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}
export class QueryEmployeesDto extends QueryCustomersDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
