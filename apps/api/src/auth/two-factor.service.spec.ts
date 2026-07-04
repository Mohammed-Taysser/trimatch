import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { User } from '../identity/user.model';
import { UsersService } from '../identity/users.service';
import { SettingsService } from '../settings/settings.service';
import { TwoFactorRecoveryCode } from './two-factor-recovery-code.model';
import { TwoFactorService } from './two-factor.service';

const SECRET = authenticator.generateSecret();

function makeService(
  user: Partial<User> | null,
  recoveryRows: { codeHash: string; update: jest.Mock }[] = [],
  requires2fa = false,
) {
  const users = {
    findById: jest.fn().mockResolvedValue(user),
    setTotpSecret: jest.fn().mockResolvedValue(undefined),
    enableTotp: jest.fn().mockResolvedValue(undefined),
    disableTotp: jest.fn().mockResolvedValue(undefined),
  } as unknown as UsersService;
  const recoveryCodes = {
    destroy: jest.fn().mockResolvedValue(0),
    bulkCreate: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue(recoveryRows),
  } as unknown as typeof TwoFactorRecoveryCode;
  const settings = {
    getCompany: jest.fn().mockResolvedValue(requires2fa),
  } as unknown as SettingsService;
  const service = new TwoFactorService(users, recoveryCodes, settings);
  return { service, users, recoveryCodes, settings };
}

const enrolled = { id: 'u1', email: 'user@demo', totpSecret: SECRET, totpEnabled: false } as User;

describe('TwoFactorService enrolment', () => {
  it('setup returns an otpauth URI + secret and stores the pending secret', async () => {
    const { service, users } = makeService({ id: 'u1', email: 'user@demo', totpEnabled: false });
    const result = await service.setup('u1');
    expect(result.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(result.secret).toEqual(expect.any(String));
    expect(users.setTotpSecret).toHaveBeenCalledWith('u1', result.secret);
  });

  it('setup refuses when 2FA is already enabled', async () => {
    const { service } = makeService({ id: 'u1', email: 'user@demo', totpEnabled: true });
    await expect(service.setup('u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('enable turns 2FA on and returns ten recovery codes for a valid code', async () => {
    const { service, users, recoveryCodes } = makeService(enrolled);
    const result = await service.enable('u1', authenticator.generate(SECRET));
    expect(result.recoveryCodes).toHaveLength(10);
    expect(users.enableTotp).toHaveBeenCalledWith('u1');
    expect(recoveryCodes.bulkCreate).toHaveBeenCalled();
  });

  it('enable rejects a wrong code and does not turn 2FA on', async () => {
    const { service, users } = makeService(enrolled);
    await expect(service.enable('u1', '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.enableTotp).not.toHaveBeenCalled();
  });

  it('enable requires a prior setup (no pending secret → 400)', async () => {
    const { service } = makeService({ id: 'u1', email: 'user@demo', totpEnabled: false });
    await expect(service.enable('u1', '000000')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TwoFactorService code verification', () => {
  it('accepts the current TOTP code', async () => {
    const { service } = makeService(enrolled);
    const user = { id: 'u1', totpSecret: SECRET } as User;
    expect(await service.verifyCode(user, authenticator.generate(SECRET))).toBe(true);
  });

  it('accepts and consumes an unused recovery code', async () => {
    const row = { codeHash: bcrypt.hashSync('recover-me', 4), update: jest.fn() };
    const { service } = makeService(enrolled, [row]);
    const user = { id: 'u1', totpSecret: SECRET } as User;
    expect(await service.verifyCode(user, 'recover-me')).toBe(true);
    expect(row.update).toHaveBeenCalledWith({ usedAt: expect.any(Date) });
  });

  it('rejects a code that is neither a valid TOTP nor a recovery code', async () => {
    const { service } = makeService(enrolled, []);
    const user = { id: 'u1', totpSecret: SECRET } as User;
    expect(await service.verifyCode(user, 'nope-nope')).toBe(false);
  });
});

describe('TwoFactorService disable', () => {
  it('turns 2FA off and clears recovery codes for a valid code', async () => {
    const enabled = { id: 'u1', email: 'user@demo', totpSecret: SECRET, totpEnabled: true } as User;
    const { service, users, recoveryCodes } = makeService(enabled);
    await service.disable('u1', authenticator.generate(SECRET));
    expect(users.disableTotp).toHaveBeenCalledWith('u1');
    expect(recoveryCodes.destroy).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('refuses when 2FA is not enabled', async () => {
    const { service } = makeService(enrolled);
    await expect(service.disable('u1', '000000')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to disable when the company mandates 2FA (869e01dmv)', async () => {
    const enabled = { id: 'u1', email: 'user@demo', totpSecret: SECRET, totpEnabled: true } as User;
    const { service } = makeService(enabled, [], true); // company requires 2FA
    await expect(service.disable('u1', authenticator.generate(SECRET))).rejects.toMatchObject({
      response: { code: 'TWO_FACTOR_REQUIRED_BY_POLICY' },
    });
  });
});
