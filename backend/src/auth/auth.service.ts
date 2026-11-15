import { RbacService } from './rbac.service.js';

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service.js';

import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly rbac: RbacService,
  ) {}

  async login(dto: LoginDto) {
    const client = await this.rbac.pool.connect();
    let user: {
      id: string;
      username: string;
      status: string;
      password_changed_at: Date | null;
    };
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('factory:rbac'))",
      );
      const { rows } = await client.query(
        'SELECT id,username,status,deleted_at,password_hash,failed_login_attempts,password_changed_at,login_blocked_until FROM users WHERE username=$1 FOR UPDATE',
        [dto.username],
      );
      const found = rows[0];
      if (!found || found.status !== 'ACTIVE' || found.deleted_at)
        throw new UnauthorizedException(
          'Tên đăng nhập hoặc mật khẩu không đúng / tài khoản không khả dụng',
        );
      if (
        found.login_blocked_until &&
        new Date(found.login_blocked_until).getTime() > Date.now()
      )
        throw new UnauthorizedException(
          'Tạm chặn đăng nhập. Vui lòng thử lại sau 5 phút.',
        );
      if (!(await argon2.verify(found.password_hash, dto.password))) {
        const attempts = found.failed_login_attempts + 1;
        if (attempts > 10) {
          await client.query('SAVEPOINT protect_admin');
          await client.query(
            "UPDATE users SET status='LOCKED',failed_login_attempts=$2,updated_at=clock_timestamp() WHERE id=$1",
            [found.id, attempts],
          );
          try {
            await this.rbac.ensureAdmin(client);
          } catch (error) {
            if (!(error instanceof ConflictException)) throw error;
            await client.query('ROLLBACK TO SAVEPOINT protect_admin');
            await client.query(
              "UPDATE users SET failed_login_attempts=$2,login_blocked_until=clock_timestamp()+interval '5 minutes' WHERE id=$1",
              [found.id, attempts],
            );
          }
          await client.query(
            "INSERT INTO security_audit(target_id,action,after_state) SELECT id,'auth.failed_login_limit',jsonb_build_object('status',status,'login_blocked_until',login_blocked_until) FROM users WHERE id=$1",
            [found.id],
          );
        } else
          await client.query(
            'UPDATE users SET failed_login_attempts=$2 WHERE id=$1',
            [found.id, attempts],
          );
        await client.query('COMMIT');
        throw new UnauthorizedException(
          'Tên đăng nhập hoặc mật khẩu không đúng',
        );
      }
      await client.query(
        'UPDATE users SET failed_login_attempts=0,login_blocked_until=NULL WHERE id=$1',
        [found.id],
      );
      user = {
        id: found.id,
        username: found.username,
        status: found.status,
        password_changed_at: found.password_changed_at,
      };
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      password_revision: user.password_changed_at?.toISOString() ?? null,
      username: String(user.username),
    });

    return {
      data: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 86400,
        user: {
          id: user.id,
          username: user.username,
          status: user.status,
        },
      },
    };
  }

  async getMe(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu Bearer access token');
    }

    const token = authorization.slice(7);

    let payload: { sub: string };

    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token);
    } catch {
      throw new UnauthorizedException(
        'Access token không hợp lệ hoặc đã hết hạn',
      );
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('Access token không hợp lệ');
    }

    const user = await this.prisma.db.orm.public.User.where({
      id: payload.sub,
    }).first();

    if (!user || user.status !== 'ACTIVE' || user.deletedAt !== null) {
      throw new UnauthorizedException('Tài khoản không khả dụng');
    }

    return {
      data: {
        id: user.id,
        username: user.username,
        status: user.status,
        employee_id: user.employeeId,
      },
    };
  }

  async getPermissions(userId: string) {
    await this.rbac.active(userId);
    return { data: await this.rbac.effective(userId) };
  }
  async getMeByUserId(userId: string) {
    const user = await this.prisma.db.orm.public.User.where({
      id: userId,
    }).first();

    if (!user || user.status !== 'ACTIVE' || user.deletedAt !== null) {
      throw new UnauthorizedException('Tài khoản không khả dụng');
    }

    return {
      data: {
        id: user.id,
        username: user.username,
        status: user.status,
        employee_id: user.employeeId,
      },
    };
  }
}
