import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or entire controller) as not requiring JWT authentication.
 * Used by JwtAuthGuard, which is applied globally.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
