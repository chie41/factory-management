
import {
  Controller,
  Get,
  NotFoundException,
} from '@nestjs/common';

import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/database')
  async checkDatabase() {
    // Chỉ sử dụng endpoint này trong môi trường development
    if (process.env['NODE_ENV'] !== 'development') {
      throw new NotFoundException();
    }

    // Thực hiện một truy vấn thật đến bảng users
    await this.prisma.db.orm.public.User.first();

    return {
      data: {
        database: 'connected',
      },
    };
  }
}
