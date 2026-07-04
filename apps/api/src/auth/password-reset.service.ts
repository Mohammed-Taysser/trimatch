import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { Op } from 'sequelize';
import { UsersService } from '../identity/users.service';
import { OUTBOUND_CHANNEL, OutboundChannel } from '../notifications/outbound/outbound-channel';
import { PasswordResetOtp } from './password-reset-otp.model';

// Security constants (business rules, not env): a short-lived OTP with a bounded
// number of guesses. Online guessing is further bounded by the throttler.
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

// Uniform failure so nothing distinguishes "no such email" from "wrong code".
function invalidReset(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_RESET',
    message: 'Invalid or expired reset code',
  });
}

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectModel(PasswordResetOtp) private readonly otps: typeof PasswordResetOtp,
    private readonly users: UsersService,
    @Inject(OUTBOUND_CHANNEL) private readonly channel: OutboundChannel,
  ) {}

  // Always succeeds from the caller's view — an unknown email is a silent no-op
  // so the response never reveals whether an account exists.
  async requestReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    // Supersede any still-valid OTP so only the newest code works.
    await this.otps.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null } });

    const code = authenticator.generate(authenticator.generateSecret());
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.otps.create({
      userId: user.id,
      codeHash: await bcrypt.hash(code, 10),
      expiresAt,
      attempts: 0,
    });

    await this.channel.deliverPasswordReset({
      recipientEmail: user.email,
      recipientName: user.fullName,
      code,
      expiresAt: expiresAt.toISOString(),
    });
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) throw invalidReset();

    const otp = await this.otps.findOne({
      where: { userId: user.id, usedAt: null, expiresAt: { [Op.gt]: new Date() } },
      order: [['createdAt', 'DESC']],
    });
    if (!otp) throw invalidReset();

    if (otp.attempts >= MAX_ATTEMPTS) {
      await otp.update({ usedAt: new Date() }); // burn it after too many guesses
      throw invalidReset();
    }
    if (!(await bcrypt.compare(code, otp.codeHash))) {
      await otp.update({ attempts: otp.attempts + 1 });
      throw invalidReset();
    }

    await this.users.setPasswordHash(user.id, await bcrypt.hash(newPassword, 10));
    await otp.update({ usedAt: new Date() }); // single-use
  }
}
