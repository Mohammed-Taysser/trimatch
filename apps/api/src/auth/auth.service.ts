import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, AuthUserSchema, LoginResponse, LoginResponseSchema } from '@trimatch/shared';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../identity/users.service';
import { OUTBOUND_CHANNEL, OutboundChannel } from '../notifications/outbound/outbound-channel';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @Inject(OUTBOUND_CHANNEL) private readonly channel: OutboundChannel,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
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
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    });
    return LoginResponseSchema.parse({
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
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
