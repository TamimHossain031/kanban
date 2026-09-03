import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { AuthService } from '../auth.service';

/**
 * Validates email + password for the login route. `usernameField: 'email'`
 * because our credential is an email, not a username.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, password: string): Promise<AuthUser> {
    const user = await this.auth.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    return user;
  }
}
