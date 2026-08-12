import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Applied on top of the global JwtAuthGuard within the Admin module only.
 * Requires the authenticated user's role to be ADMIN (role is re-read from
 * the DB on every request via JwtStrategy, so a demotion/block takes effect
 * immediately without needing a new token).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
