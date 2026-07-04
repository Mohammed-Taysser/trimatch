import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  TwoFactorEnableResponse,
  TwoFactorEnableResponseSchema,
  TwoFactorSetupResponse,
  TwoFactorSetupResponseSchema,
} from '@trimatch/shared';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { User } from '../identity/user.model';
import { UsersService } from '../identity/users.service';
import { TwoFactorRecoveryCode } from './two-factor-recovery-code.model';

const ISSUER = 'TriMatch';
const RECOVERY_CODE_COUNT = 10;

function invalidCode(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_TWO_FACTOR_CODE',
    message: 'Invalid two-factor code',
  });
}

// Optional TOTP 2FA (869dzycut): enrolment, activation with recovery codes,
// code verification (TOTP or single-use recovery code), and teardown.
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly users: UsersService,
    @InjectModel(TwoFactorRecoveryCode)
    private readonly recoveryCodes: typeof TwoFactorRecoveryCode,
  ) {}

  // Generates a fresh secret and returns it plus the otpauth URI to render as a
  // QR. The secret is stored pending — only trusted once `enable` confirms it.
  async setup(userId: string): Promise<TwoFactorSetupResponse> {
    const user = await this.requireUser(userId);
    if (user.totpEnabled) {
      throw new ConflictException({
        code: 'TWO_FACTOR_ALREADY_ENABLED',
        message: 'Two-factor auth is already enabled — disable it before re-enrolling',
      });
    }
    const secret = authenticator.generateSecret();
    await this.users.setTotpSecret(userId, secret);
    return TwoFactorSetupResponseSchema.parse({
      secret,
      otpauthUri: authenticator.keyuri(user.email, ISSUER, secret),
    });
  }

  // Confirms the authenticator is set up (a valid code), turns 2FA on, and issues
  // one-time recovery codes (returned once, only their hashes are kept).
  async enable(userId: string, code: string): Promise<TwoFactorEnableResponse> {
    const user = await this.requireUser(userId);
    if (user.totpEnabled) {
      throw new ConflictException({
        code: 'TWO_FACTOR_ALREADY_ENABLED',
        message: 'Two-factor auth is already enabled',
      });
    }
    if (!user.totpSecret) {
      throw new BadRequestException({
        code: 'TWO_FACTOR_NOT_SET_UP',
        message: 'Start enrolment with POST /auth/2fa/setup first',
      });
    }
    if (!authenticator.verify({ token: code, secret: user.totpSecret })) {
      throw invalidCode();
    }
    await this.users.enableTotp(userId);
    return TwoFactorEnableResponseSchema.parse({
      recoveryCodes: await this.regenerateRecoveryCodes(userId),
    });
  }

  // Turns 2FA off after proving possession (a TOTP or recovery code) and clears
  // the secret and every recovery code.
  async disable(userId: string, code: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (!user.totpEnabled) {
      throw new ConflictException({
        code: 'TWO_FACTOR_NOT_ENABLED',
        message: 'Two-factor auth is not enabled',
      });
    }
    if (!(await this.verifyCode(user, code))) {
      throw invalidCode();
    }
    await this.users.disableTotp(userId);
    await this.recoveryCodes.destroy({ where: { userId } });
  }

  // True when `code` is the current TOTP or an unused recovery code (consumed on
  // match). Used by the login second-factor step.
  async verifyCode(user: User, code: string): Promise<boolean> {
    if (user.totpSecret && authenticator.verify({ token: code, secret: user.totpSecret })) {
      return true;
    }
    return this.consumeRecoveryCode(user.id, code);
  }

  private async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    await this.recoveryCodes.destroy({ where: { userId } });
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomBytes(5).toString('hex'));
    await this.recoveryCodes.bulkCreate(
      await Promise.all(
        codes.map(async (code) => ({ userId, codeHash: await bcrypt.hash(code, 10) })),
      ),
    );
    return codes;
  }

  private async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const rows = await this.recoveryCodes.findAll({ where: { userId, usedAt: null } });
    for (const row of rows) {
      if (await bcrypt.compare(code, row.codeHash)) {
        await row.update({ usedAt: new Date() });
        return true;
      }
    }
    return false;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User no longer exists' });
    }
    return user;
  }
}
