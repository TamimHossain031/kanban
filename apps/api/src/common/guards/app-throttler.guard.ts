import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard that can be switched off with THROTTLE_DISABLED=true.
 * Globally-registered guards (APP_GUARD) can't be replaced via
 * Test.overrideGuard, so functional/e2e tests set this flag instead of
 * tripping the 5-req/min auth limit while registering many users.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.THROTTLE_DISABLED === 'true') return true;
    return super.canActivate(context);
  }
}
