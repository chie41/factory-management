import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReverseLedgerEntryDto {
  @ApiPropertyOptional({ example: 'Ghi nhận nhầm giao dịch' })
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
