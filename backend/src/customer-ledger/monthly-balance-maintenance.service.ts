import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { MonthlyBalanceService } from './monthly-balance.service.js';

/** Bounded in-process maintenance; report requests never wait for a rebuild. */
@Injectable()
export class MonthlyBalanceMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonthlyBalanceMaintenanceService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private cursor?: string;
  private nextPass = Date.now() + 60_000;
  constructor(private readonly monthly: MonthlyBalanceService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running || Date.now() < this.nextPass) return;
      this.running = this.batch().finally(() => { this.running = undefined; });
    }, 60_000);
    this.timer.unref();
  }
  private async batch() {
    try {
      const result = await this.monthly.rebuildBatch(this.cursor, 50);
      this.cursor = result.cursor ?? undefined;
      this.nextPass = Date.now() + (result.cursor ? 0 : 3_600_000);
    } catch (error) {
      // No cursor advance on failure: the same batch is safe to retry.
      this.nextPass = Date.now() + 60_000;
      this.logger.warn(`Monthly balance maintenance deferred: ${error instanceof Error ? error.message : 'database unavailable'}`);
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
