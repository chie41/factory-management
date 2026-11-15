import { RbacModule } from './auth/rbac.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ProductionModule } from './production/production.module.js';
import { GoldRefiningModule } from './gold-refining/gold-refining.module.js';

import { Module } from '@nestjs/common';
import { EmployeesModule } from './employees/employees.module.js';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { CustomerLedgerModule } from './customer-ledger/customer-ledger.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    PrismaModule,
    RbacModule,
    AuthModule,
    CustomersModule,
    CustomerLedgerModule,
    UsersModule,
    EmployeesModule,
    CatalogModule,
    ProductionModule,
    GoldRefiningModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
