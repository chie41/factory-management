
import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { Type } from 'class-transformer';

export class QueryCustomersDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
    name: 'page_size',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 20;

  @ApiPropertyOptional({
    example: 'KH001',
    description: 'Tìm theo mã, tên hoặc số điện thoại',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
