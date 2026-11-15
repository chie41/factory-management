import { ExcelImportService } from './excel-import/excel-import.service.js';
import { LedgerPdfService } from './print/ledger-pdf.service.js';
import { LedgerPrintController } from './print/ledger-print.controller.js';
import { ExcelImportController } from './excel-import/excel-import.controller.js';
import { CustomersService } from '../customers/customers.service.js';
import { LedgerLayoutService } from './ledger-layout.service.js';
import { LaborPricingService } from '../catalog/labor-pricing.service.js';
import { CustomerLaborPricesService } from '../customers/customer-labor-prices.service.js';
import { MonthlyBalanceMaintenanceService } from './monthly-balance-maintenance.service.js';
import { MonthlyBalanceService } from './monthly-balance.service.js';
import { QuickEntryService } from './workflow/quick-entry.service.js';
import { QuickEntryController } from './workflow/quick-entry.controller.js';
import { LedgerWorkflowService } from './workflow/ledger-workflow.service.js';
import {
  LedgerOrdersController,
  LedgerTripsController,
  LedgerWorkflowController,
  LedgerCashController,
} from './workflow/ledger-workflow.controller.js';

import 'dotenv/config';

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CustomerLedgerController } from './customer-ledger.controller.js';
import { CustomerLedgerService } from './customer-ledger.service.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'],
      signOptions: {
        expiresIn: 86400,
      },
    }),
  ],
  controllers: [LedgerPrintController, ExcelImportController,
    CustomerLedgerController,
    QuickEntryController,
    LedgerOrdersController,
    LedgerTripsController,
    LedgerWorkflowController,
    LedgerCashController,
  ],
  providers: [LedgerPdfService, ExcelImportService, CustomersService, LedgerLayoutService, LaborPricingService,
    CustomerLaborPricesService,
    MonthlyBalanceService,
    MonthlyBalanceMaintenanceService,
    CustomerLedgerService,
    QuickEntryService,
    LedgerWorkflowService,
    JwtAuthGuard,
    PermissionGuard,
  ],
})
export class CustomerLedgerModule {}
