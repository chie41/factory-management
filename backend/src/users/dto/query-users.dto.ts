import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsUUID,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryUsersDto {
  @IsOptional() @IsUUID() group_id?: string;
  @IsOptional() @IsUUID() role_id?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ name: 'page_size', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 20;

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: ['ACTIVE', 'LOCKED'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'LOCKED'])
  status?: 'ACTIVE' | 'LOCKED';
}
