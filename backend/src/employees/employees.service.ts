import { Injectable, NotFoundException } from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntityCodeService } from '../prisma/entity-code.js';
import { varchar } from '../prisma/varchar.js';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  QueryEmployeesDto,
} from './dto/employee.dto.js';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: EntityCodeService,
  ) {}

  async accountAvailability(id: string) {
    await this.findOne(id);
    const user = await this.prisma.db.orm.public.User.where({ employeeId: id })
      .where((u) => u.deletedAt.isNull())
      .first();
    return { data: { has_account: !!user } };
  }
  async findAll(query: QueryEmployeesDto) {
    let rows = this.prisma.db.orm.public.Employee.where((c) =>
      c.deletedAt.isNull(),
    );
    if (query.status) rows = rows.where({ status: varchar(query.status, 30) });
    if (query.q?.trim()) {
      const pattern = `%${query.q.trim()}%`;
      rows = rows.where((c) =>
        or(
          c.employeeCode.ilike(pattern),
          c.fullName.ilike(pattern),
          c.phone.ilike(pattern),
        ),
      );
    }
    const all = await rows.orderBy((c) => c.createdAt.desc()).all();
    const page = query.page ?? 1,
      size = query.page_size ?? 20;
    return {
      data: all.slice((page - 1) * size, page * size).map(this.present),
      meta: {
        page,
        page_size: size,
        total: all.length,
        total_pages: Math.ceil(all.length / size),
      },
    };
  }

  private present(row: {
    employeeCode: unknown;
    fullName: unknown;
    roleLabel: unknown;
    startDate: unknown;
    [key: string]: unknown;
  }) {
    return {
      ...row,
      code: row.employeeCode,
      name: row.fullName,
      role: row.roleLabel,
      start_date: row.startDate,
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.db.orm.public.Employee.where({ id })
      .where((c) => c.deletedAt.isNull())
      .first();
    if (!row) throw new NotFoundException('Không tìm thấy nhân viên');
    return { data: this.present(row) };
  }

  async create(dto: CreateEmployeeDto) {
    const row = await this.prisma.db.orm.public.Employee.create({
      employeeCode: varchar(await this.codes.next('employee'), 50),
      fullName: varchar(dto.name, 180),
      roleLabel: dto.role == null ? null : varchar(dto.role, 120),
      phone: dto.phone == null ? null : varchar(dto.phone, 30),
      startDate: dto.start_date ?? null,
      status: varchar(dto.status ?? 'ACTIVE', 30),
      note: dto.note ?? null,
    });
    return { data: this.present(row) };
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    const row = await this.prisma.db.orm.public.Employee.where({ id })
      .where((c) => c.deletedAt.isNull())
      .update({
        ...(dto.name != null && { fullName: varchar(dto.name, 180) }),
        ...(dto.role !== undefined && {
          roleLabel: dto.role == null ? null : varchar(dto.role, 120),
        }),
        ...(dto.phone !== undefined && {
          phone: dto.phone == null ? null : varchar(dto.phone, 30),
        }),
        ...(dto.start_date !== undefined && { startDate: dto.start_date }),
        ...(dto.status != null && { status: varchar(dto.status, 30) }),
        ...(dto.note !== undefined && { note: dto.note }),
        updatedAt: new Date().toISOString(),
      });
    if (!row) throw new NotFoundException('Không tìm thấy nhân viên');
    return { data: this.present(row) };
  }
}
