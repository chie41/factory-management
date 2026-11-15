import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { RbacService } from '../auth/rbac.service.js';

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { or } from '@prisma/orm-postgres/orm-client';

import { PrismaService } from '../prisma/prisma.service.js';
import { EntityCodeService } from '../prisma/entity-code.js';

import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { QueryCustomersDto } from './dto/query-customers.dto.js';

@Injectable()
export class CustomersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly codes: EntityCodeService,
        private readonly rbac: RbacService,
    ) { }

    // ==========================================
    // 1. DANH SÁCH + TÌM KIẾM + PHÂN TRANG
    // ==========================================


    async findAll(query: QueryCustomersDto) {
        const page = query.page ?? 1;
        const pageSize = query.page_size ?? 20;
        const search = query.q?.trim();

        // Chỉ lấy khách hàng chưa bị xóa mềm.
        const customers = this.prisma.db.orm.public.Customer
            .where((c) => c.deletedAt.isNull());

        if (search) {
            const pattern = `%${search}%`;

            const filtered = customers.where((c) =>
                or(
                    c.name.ilike(pattern),
                    c.customerCode.ilike(pattern),
                    c.phone.ilike(pattern),
                ),
            );

            // Prisma 8 RC hiện tại không hỗ trợ gọi count()
            // trực tiếp bên ngoài include() refinement.
            const allCustomers = await filtered
                .orderBy((c) => c.createdAt.desc())
                .all();

            const total = allCustomers.length;
            const start = (page - 1) * pageSize;
            const data = allCustomers.slice(
                start,
                start + pageSize,
            );

            return {
                data,
                meta: {
                    page,
                    page_size: pageSize,
                    total,
                    total_pages: Math.ceil(total / pageSize),
                },
            };
        }

        const allCustomers = await customers
            .orderBy((c) => c.createdAt.desc())
            .all();

        const total = allCustomers.length;
        const start = (page - 1) * pageSize;
        const data = allCustomers.slice(
            start,
            start + pageSize,
        );

        return {
            data,
            meta: {
                page,
                page_size: pageSize,
                total,
                total_pages: Math.ceil(total / pageSize),
            },
        };
    }


    // ==========================================
    // 2. LẤY CHI TIẾT KHÁCH HÀNG
    // ==========================================

    async findOne(id: string) {
        const customer =
            await this.prisma.db.orm.public.Customer
                .where({ id })
                .where((c) => c.deletedAt.isNull())
                .first();

        if (!customer) {
            throw new NotFoundException(
                'Không tìm thấy khách hàng',
            );
        }

        return {
            data: customer,
        };
    }

    // ==========================================
    // 3. TẠO KHÁCH HÀNG
    // ==========================================

    private readonly customerColumns = `id,customer_code "customerCode",name,phone,address,status,note,
      created_at "createdAt",updated_at "updatedAt",deleted_at "deletedAt"`;

    private async matchingNames(name: string, excludeId?: string, client: Pool | PoolClient = this.rbac.pool) {
        if (!name.trim()) return [];
        // Do not remove accents or use a fuzzy/substring comparison.
        const normalized = (field: string) => `lower(normalize(btrim(regexp_replace(${field}, '[[:space:]]+', ' ', 'g')), NFC))`;
        return (await client.query(
            `SELECT ${this.customerColumns} FROM customers
             WHERE deleted_at IS NULL AND ($2::uuid IS NULL OR id<>$2::uuid)
               AND ${normalized('name')}=${normalized('$1::text')}
             ORDER BY customer_code,id`, [name, excludeId ?? null],
        )).rows;
    }

    async duplicateNames(name: string, excludeId?: string) {
        return { data: await this.matchingNames(name, excludeId) };
    }

    private async writeCustomer(dto: CreateCustomerDto | UpdateCustomerDto, id?: string, actor = '', external?: PoolClient) {
        const c = external ?? await this.rbac.pool.connect();
        try {
            if (!external) await c.query('BEGIN');
            // Also blocks ordinary SQL/ORM writers until check + write commit.
            // No unique constraint: confirmed duplicates remain allowed.
            await c.query('LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE');
            const previous = id ? (await c.query('SELECT * FROM customers WHERE id=$1 AND deleted_at IS NULL', [id])).rows[0] : undefined;
            if (id && !previous) throw new NotFoundException('Không tìm thấy khách hàng');
            if (dto.name != null) {
                if (dto.name == null || !dto.name.trim()) throw new BadRequestException('Nhập tên khách hàng');
                const duplicates = await this.matchingNames(dto.name, id, c);
                if (duplicates.length) {
                    const context = JSON.stringify({ actor, id: id ?? null,
                        values: { name: dto.name, phone: dto.phone, address: dto.address, status: dto.status, note: dto.note },
                        previous: previous ?? null, duplicates });
                    const sign = (issuedAt: string) => createHmac('sha256', process.env['JWT_SECRET']!).update(issuedAt + ':' + context).digest('hex');
                    const token = dto.duplicate_name_confirmation ?? '';
                    const [issuedAt = '', signature = ''] = token.split('.');
                    const age = Date.now() - Number(issuedAt);
                    const confirmed = /^\d{13}$/.test(issuedAt) && age >= 0 && age <= 600000 &&
                        /^[a-f0-9]{64}$/.test(signature) && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(issuedAt), 'hex'));
                    if (!confirmed) {
                        const now = String(Date.now());
                        throw new ConflictException({ code: 'CUSTOMER_NAME_DUPLICATE',
                            message: 'Tên khách hàng này đã tồn tại trong hệ thống. Vui lòng kiểm tra trước khi tạo mới.',
                            duplicates, confirmation_token: now + '.' + sign(now) });
                    }
                }
            }
            let customer;
            if (id) {
                const fields = ['name','phone','address','status','note'] as const;
                const assignments: string[] = [], values: unknown[] = [id];
                for (const field of fields) {
                    // Preserve existing PATCH semantics: null name/status is ignored.
                    if (dto[field] !== undefined && !(['name','status'].includes(field) && dto[field] == null)) {
                        values.push(dto[field]); assignments.push(`${field}=$${values.length}`);
                    }
                }
                assignments.push('updated_at=clock_timestamp()');
                customer = (await c.query(`UPDATE customers SET ${assignments.join(',')} WHERE id=$1 RETURNING ${this.customerColumns}`, values)).rows[0];
            } else {
                const code = await this.codes.next('customer');
                customer = (await c.query(`INSERT INTO customers(id,customer_code,name,phone,address,status,note)
                    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${this.customerColumns}`,
                    [randomUUID(),code,dto.name,dto.phone ?? null,dto.address ?? null,dto.status ?? 'ACTIVE',dto.note ?? null])).rows[0];
            }
            if (!external) await c.query('COMMIT');
            return { data: customer };
        } catch (error) { if (!external) await c.query('ROLLBACK'); throw error; }
        finally { if (!external) c.release(); }
    }

    async create(dto: CreateCustomerDto, actor = '', external?: PoolClient) {
        return this.writeCustomer(dto, undefined, actor, external);
    }

    async update(id: string, dto: UpdateCustomerDto, actor = '') {
        return this.writeCustomer(dto, id, actor);
    }

    // ==========================================
    // 5. XÓA MỀM KHÁCH HÀNG
    // ==========================================

    async remove(id: string): Promise<void> {
        const now = new Date().toISOString();

        const customer =
            await this.prisma.db.orm.public.Customer
                .where({ id })
                .where((c) => c.deletedAt.isNull())
                .update({
                    deletedAt: now,
                    updatedAt: now,
                });

        if (!customer) {
            throw new NotFoundException(
                'Không tìm thấy khách hàng',
            );
        }
    }
}
