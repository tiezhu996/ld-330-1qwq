import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { APP_MESSAGES } from './constants';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

interface ActorPayload {
  sub: string;
  role: string;
  name: string;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: ActorPayload }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      request.user = this.jwtService.verify<ActorPayload>(token);
    } catch {
      throw new UnauthorizedException(APP_MESSAGES.unauthorized);
    }
    const required = this.reflector.get<string[]>('roles', context.getHandler()) ?? [];
    if (required.length && !required.includes(request.user.role)) {
      throw new ForbiddenException(APP_MESSAGES.forbidden);
    }
    return true;
  }
}
