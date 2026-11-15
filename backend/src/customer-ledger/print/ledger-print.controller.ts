import { Body, Controller, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator.js';
import { LedgerPdfService } from './ledger-pdf.service.js';

export class LedgerPrintDto {
  @IsString() @MinLength(1) @MaxLength(6_000_000) markup!: string;
}

@Controller('customer-ledger/print')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LedgerPrintController {
  constructor(private readonly pdf: LedgerPdfService) {}

  @Post('pdf')
  @RequirePermissions('customer_ledger.read')
  async render(@Body() dto: LedgerPrintDto) {
    return new StreamableFile(await this.pdf.render(dto.markup), {
      type: 'application/pdf', disposition: 'inline; filename="so-giao-dich.pdf"',
    });
  }
}
