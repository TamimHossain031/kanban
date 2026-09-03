import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route out of the global JwtAuthGuard.
 * Secure-by-default: everything is protected unless it says `@Public()`.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
