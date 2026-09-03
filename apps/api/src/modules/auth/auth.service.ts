import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from './strategies/jwt.strategy';
import { RegisterDto } from './dto/register.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash },
      select: { id: true, email: true, name: true },
    });

    return this.issue(user);
  }

  /**
   * Used by LocalStrategy. Returns the safe user shape on success, or null.
   * Constant-ish work either way — we still verify against a hash even when
   * the user is missing would be ideal; here we simply return null.
   */
  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return null;
    return { id: user.id, email: user.email, name: user.name };
  }

  /** LocalAuthGuard has already validated credentials; just mint tokens. */
  async login(user: AuthUser): Promise<AuthResult> {
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');

    return this.issue(user);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user;
  }

  // ── token minting ──────────────────────────────────────────────
  private async issue(user: AuthUser): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      }),
      this.jwt.signAsync(payload, {
        secret: this.refreshSecret(),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '7d',
      }),
    ]);

    return { user, accessToken, refreshToken };
  }

  /** Fall back to the access secret if no dedicated refresh secret is set. */
  private refreshSecret(): string {
    return (
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }
}
