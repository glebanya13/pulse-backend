import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global auth guard. Every route requires a valid JWT access token unless
 * annotated with @Public(). On public routes we still try to parse a Bearer
 * token when present (optional auth for feeds / profiles).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const result = super.canActivate(context);
    if (!isPublic) {
      return result;
    }
    // Optional JWT: succeed even if token missing/invalid.
    return Promise.resolve(result).then(() => true).catch(() => true);
  }

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return (user ?? undefined) as TUser;
    }
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
