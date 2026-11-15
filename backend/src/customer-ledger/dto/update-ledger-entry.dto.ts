import { PartialType } from '@nestjs/swagger';
import { CreateLedgerEntryDto } from './create-ledger-entry.dto.js';

export class UpdateLedgerEntryDto extends PartialType(CreateLedgerEntryDto) {}
