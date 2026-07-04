import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AuthUser,
  AuthUserSchema,
  LoginResponse,
  LoginResponseSchema,
  LoginResult,
} from '@trimatch/shared';
import * as bcrypt from 'bcryptjs';
import { User } from '../identity/user.model';
import { UsersService } from '../identity/users.service';
import { OUTBOUND_CHANNEL, OutboundChannel } from '../notifications/outbound/outbound-channel';
import { SettingsService } from '../settings/settings.service';
import { TwoFactorService } from './two-factor.service';

// The 2FA login challenge is a short-lived JWT scoped so the guard rejects it for
// API access (869dzycut); it is only redeemable at POST /auth/2fa/verify.
const MFA_CHALLENGE_SCOPE = 'mfa-challenge';
const MFA_CHALLENGE_TTL = '5m';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @Inject(OUTBOUND_CHANNEL) private readonly channel: OutboundChannel,
    private readonly twoFactor: TwoFactorService,
    private readonly settings: SettingsService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
    // ADR-0007: a deactivated user cannot authenticate. Checked only after the
    // password matches, so account state never leaks to someone guessing.
    if (!user.active) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated — contact an administrator',
      });
    }
    // 869dzycut: with 2FA on, the password is only the first factor — return a
    // challenge instead of a session.
    if (user.totpEnabled) {
      const challenge = await this.jwt.signAsync(
        { sub: user.id, scope: MFA_CHALLENGE_SCOPE },
        { expiresIn: MFA_CHALLENGE_TTL },
      );
      return { twoFactorRequired: true, challenge };
    }
    // 869e01dmv: if the company mandates 2FA and this user hasn't enrolled, still
    // issue a session but flag that enrolment is required.
    const mustEnrollTwoFactor = await this.settings.getCompany<boolean>('security.require2fa');
    return this.issueSession(user, mustEnrollTwoFactor);
  }

  // Second factor: redeem the login challenge with a TOTP or recovery code.
  async verifyTwoFactor(challenge: string, code: string): Promise<LoginResponse> {
    let payload: { sub: string; scope?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; scope?: string }>(challenge);
    } catch {
      throw this.invalidChallenge();
    }
    if (payload.scope !== MFA_CHALLENGE_SCOPE) throw this.invalidChallenge();
    const user = await this.users.findById(payload.sub);
    if (!user || !user.active || !user.totpEnabled) throw this.invalidChallenge();
    if (!(await this.twoFactor.verifyCode(user, code))) {
      throw new UnauthorizedException({
        code: 'INVALID_TWO_FACTOR_CODE',
        message: 'Invalid two-factor code',
      });
    }
    return this.issueSession(user);
  }

  private async issueSession(user: User, mustEnrollTwoFactor = false): Promise<LoginResponse> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    });
    return LoginResponseSchema.parse({
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      ...(mustEnrollTwoFactor ? { mustEnrollTwoFactor: true } : {}),
    });
  }

  private invalidChallenge(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_TWO_FACTOR_CHALLENGE',
      message: 'Invalid or expired two-factor challenge — sign in again',
    });
  }

  // Authenticated change: the current password must match before rotating, and a
  // confirmation is emailed out-of-band so the account owner is alerted.
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect',
      });
    }
    await this.users.setPasswordHash(userId, await bcrypt.hash(newPassword, 10));
    // 869dzymvv: rotating the password signs out every session, including this
    // one — the client re-authenticates with the new password.
    await this.users.bumpTokenVersion(userId);
    await this.channel.deliverPasswordChanged({
      recipientEmail: user.email,
      recipientName: user.fullName,
      changedAt: new Date().toISOString(),
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User no longer exists' });
    }
    return AuthUserSchema.parse({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  }
}
