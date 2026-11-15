import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../rbac.service.js';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length)
      throw new ForbiddenException('Endpoint chưa đăng ký permission');
    const req = context.switchToHttp().getRequest<{ user: { sub: string } }>();
    await this.rbac.require(req.user?.sub, required ?? []);
    return true;
  }
}
