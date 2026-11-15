import { Global, Module } from '@nestjs/common';
import { EntityCodeService } from './entity-code.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, EntityCodeService],
  exports: [PrismaService, EntityCodeService],
})
export class PrismaModule {}
