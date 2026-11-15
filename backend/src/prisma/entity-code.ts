import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

/** PostgreSQL sequences remain consumed after rollback and across soft deletion. */
@Injectable()
export class EntityCodeService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  async next(kind: 'customer' | 'employee'): Promise<string> {
    const sequence = kind === 'customer' ? 'public.customer_code_seq' : 'public.employee_code_seq';
    const { rows } = await this.pool.query<{ value: string }>('SELECT nextval($1::regclass)::text AS value', [sequence]);
    return `${kind === 'customer' ? 'KH' : 'NV'}${rows[0]!.value.padStart(6, '0')}`;
  }

  async onModuleDestroy() { await this.pool.end(); }
}
