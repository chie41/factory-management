import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RbacService } from '../rbac.service.js';
type Payload = {
  sub: string;
  username: string;
  iat: number;
  password_revision?: string | null;
};
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly rbac: RbacService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException('Thiếu Bearer access token');
    let payload: Payload;
    try {
      payload = await this.jwtService.verifyAsync<Payload>(
        authorization.slice(7),
      );
    } catch {
      throw new UnauthorizedException(
        'Access token không hợp lệ hoặc đã hết hạn',
      );
    }
    if (!payload?.sub || typeof payload.iat !== 'number')
      throw new UnauthorizedException('Access token không hợp lệ');
    // Database failures remain server errors; only invalid sessions/accounts return 401.
    await this.rbac.active(
      payload.sub,
      payload.iat,
      undefined,
      payload.password_revision,
    );
    Object.assign(request, { user: payload });
    return true;
  }
}
