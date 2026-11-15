import { LaborPricingService } from '../catalog/labor-pricing.service.js';
import { CustomerLaborPricesService } from './customer-labor-prices.service.js';

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

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
  controllers: [CustomersController],
  providers: [LaborPricingService,
    CustomerLaborPricesService,
    CustomersService,
    JwtAuthGuard,
    PermissionGuard,
  ],
})
export class CustomersModule {}
