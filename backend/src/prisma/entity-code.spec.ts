import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { ValidationPipe } from '@nestjs/common';
import { EntityCodeService } from './entity-code.js';
import { CreateCustomerDto } from '../customers/dto/create-customer.dto.js';
import { UpdateCustomerDto } from '../customers/dto/update-customer.dto.js';
import { CreateEmployeeDto, UpdateEmployeeDto } from '../employees/dto/employee.dto.js';

describe('server-owned entity codes', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  for (const dto of [CreateCustomerDto, UpdateCustomerDto, CreateEmployeeDto, UpdateEmployeeDto]) {
    it(`${dto.name} rejects every client code spelling`, async () => {
      for (const field of ['code', 'customer_code', 'customerCode', 'employee_code', 'employeeCode']) {
        await expect(pipe.transform({ name: 'Test', [field]: 'CUSTOM' }, { type: 'body', metatype: dto })).rejects.toThrow();
      }
      await expect(pipe.transform({ name: 'Test' }, { type: 'body', metatype: dto })).resolves.toBeDefined();
    });
  }

  it.runIf(process.env['TEST_ENTITY_CODES_DB'] === '1')('migrates legacy/deleted codes and allocates concurrent inserts without reuse', async () => {
    const url = new URL(process.env['DATABASE_URL']!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Integration test requires local PostgreSQL');
    const pool = new Pool({ connectionString: url.toString(), max: 12 });
    const schema = `entity_codes_test_${Date.now()}`;
    const codes = new EntityCodeService();
    // Redirect only the allocator pool into our isolated test schema.
    const originalPool = (codes as unknown as { pool: Pool }).pool;
    await originalPool.end();
    Object.defineProperty(codes, 'pool', { value: { query: (sql: string, values: string[]) => pool.query(sql, values.map(v => v.replace('public.', `${schema}.`))), end: async () => {} } });
    try {
      await pool.query(`CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.customers (customer_code varchar(50), deleted_at timestamptz); CREATE TABLE ${schema}.employees (employee_code varchar(50), deleted_at timestamptz)`);
      await pool.query(`INSERT INTO ${schema}.customers VALUES ('KH001', NULL), ('KH000088', now()), ('OLD-X', NULL); INSERT INTO ${schema}.employees VALUES ('NV000054', now())`);
      const migration = (await readFile('migrations/sql/20261012_entity_codes.sql', 'utf8')).replaceAll('public.', `${schema}.`);
      await pool.query(migration);
      expect(await codes.next('customer')).toBe('KH000089');
      expect(await codes.next('employee')).toBe('NV000055');
      for (const kind of ['customer', 'employee'] as const) {
        const generated = await Promise.all(Array.from({ length: 60 }, async () => {
          const code = await codes.next(kind);
          await pool.query(`INSERT INTO ${schema}.${kind === 'customer' ? 'customers' : 'employees'} (${kind}_code) VALUES ($1)`, [code]);
          return code;
        }));
        expect(new Set(generated).size).toBe(60);
      }
      await pool.query(migration); // Reapplying never rewinds consumed sequence values.
      expect(await codes.next('customer')).toBe('KH000150');
      await expect(pool.query(`UPDATE ${schema}.customers SET customer_code = 'TAMPERED' WHERE customer_code = 'KH001'`)).rejects.toThrow('immutable');
      await expect(pool.query(`INSERT INTO ${schema}.customers VALUES ('KH000088', NULL)`)).rejects.toThrow('unique');
      expect((await pool.query(`SELECT customer_code FROM ${schema}.customers WHERE customer_code = 'KH001'`)).rowCount).toBe(1);
      await pool.query('BEGIN');
      await codes.next('employee'); // Allocated codes stay consumed even when creation fails.
      await pool.query('ROLLBACK');
      expect(await codes.next('employee')).toBe('NV000117');
    } finally {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    }
  }, 30000);
});
