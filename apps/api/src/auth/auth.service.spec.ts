import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../identity/users.service';
import { OutboundChannel } from '../notifications/outbound/outbound-channel';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';

const DEMO_ID = '019787c8-0000-4000-8000-000000000001';
const demoUser = {
  id: DEMO_ID,
  email: 'requester@demo',
  fullName: 'Riley Requester',
  role: 'requester',
  passwordHash: bcrypt.hashSync('Demo123!', 4),
  active: true,
  tokenVersion: 0,
  totpEnabled: false,
};

const deliverPasswordChanged = jest.fn().mockResolvedValue(undefined);
const setPasswordHash = jest.fn().mockResolvedValue(undefined);
const bumpTokenVersion = jest.fn().mockResolvedValue(undefined);
const verifyCode = jest.fn().mockResolvedValue(true);

function makeService(overrides: Partial<Record<'findByEmail' | 'findById', unknown>> = {}) {
  deliverPasswordChanged.mockClear();
  setPasswordHash.mockClear();
  bumpTokenVersion.mockClear();
  verifyCode.mockClear();
  const users = {
    findByEmail: jest.fn().mockResolvedValue(demoUser),
    findById: jest.fn().mockResolvedValue(demoUser),
    setPasswordHash,
    bumpTokenVersion,
    ...overrides,
  } as unknown as UsersService;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    verifyAsync: jest.fn().mockResolvedValue({ sub: DEMO_ID, scope: 'mfa-challenge' }),
  } as unknown as JwtService;
  const channel = { deliverPasswordChanged } as unknown as OutboundChannel;
  const twoFactor = { verifyCode } as unknown as TwoFactorService;
  return new AuthService(users, jwt, channel, twoFactor);
}

describe('login returns a JWT for valid demo credentials', () => {
  it('returns a signed token and the auth user', async () => {
    const result = await makeService().login('requester@demo', 'Demo123!');
    if (!('accessToken' in result)) throw new Error('expected a session, not a 2FA challenge');
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).toEqual({
      id: DEMO_ID,
      email: 'requester@demo',
      fullName: 'Riley Requester',
      role: 'requester',
    });
  });

  it('rejects an unknown email with INVALID_CREDENTIALS', async () => {
    const service = makeService({ findByEmail: jest.fn().mockResolvedValue(null) });
    await expect(service.login('ghost@demo', 'Demo123!')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    await expect(makeService().login('requester@demo', 'wrong')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // ADR-0007: a deactivated user cannot authenticate even with the right
  // password. The check runs after bcrypt.compare so state never leaks.
  it('rejects a deactivated account with ACCOUNT_DEACTIVATED (correct password)', async () => {
    const service = makeService({
      findByEmail: jest.fn().mockResolvedValue({ ...demoUser, active: false }),
    });
    await expect(service.login('requester@demo', 'Demo123!')).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DEACTIVATED' },
    });
  });
});

describe('login with 2FA enabled returns a challenge, not a session (869dzycut)', () => {
  it('returns a challenge instead of an access token', async () => {
    const service = makeService({
      findByEmail: jest.fn().mockResolvedValue({ ...demoUser, totpEnabled: true }),
    });
    const result = await service.login('requester@demo', 'Demo123!');
    expect(result).toEqual({ twoFactorRequired: true, challenge: 'signed.jwt.token' });
  });
});

describe('verifyTwoFactor exchanges a valid challenge for a session', () => {
  const enabledUser = { ...demoUser, totpEnabled: true };

  it('issues a session when the challenge and code are valid', async () => {
    const service = makeService({ findById: jest.fn().mockResolvedValue(enabledUser) });
    const result = await service.verifyTwoFactor('challenge.jwt', '123456');
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(verifyCode).toHaveBeenCalled();
  });

  it('rejects when the code is wrong', async () => {
    verifyCode.mockResolvedValueOnce(false);
    const service = makeService({ findById: jest.fn().mockResolvedValue(enabledUser) });
    await expect(service.verifyTwoFactor('challenge.jwt', '000000')).rejects.toMatchObject({
      response: { code: 'INVALID_TWO_FACTOR_CODE' },
    });
  });

  it('rejects a user who is no longer 2FA-enabled', async () => {
    const service = makeService({ findById: jest.fn().mockResolvedValue(demoUser) });
    await expect(service.verifyTwoFactor('challenge.jwt', '123456')).rejects.toMatchObject({
      response: { code: 'INVALID_TWO_FACTOR_CHALLENGE' },
    });
  });
});

describe('me resolves the current user from the token subject', () => {
  it('returns the auth user shape', async () => {
    const result = await makeService().me(DEMO_ID);
    expect(result).toEqual({
      id: DEMO_ID,
      email: 'requester@demo',
      fullName: 'Riley Requester',
      role: 'requester',
    });
  });

  it('throws USER_NOT_FOUND when the user is gone', async () => {
    const service = makeService({ findById: jest.fn().mockResolvedValue(null) });
    await expect(service.me(DEMO_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('changePassword rotates only after the current password matches', () => {
  it('rotates the hash and emails a confirmation', async () => {
    const service = makeService();
    await service.changePassword(DEMO_ID, 'Demo123!', 'BrandNew1!');
    expect(setPasswordHash).toHaveBeenCalledWith(DEMO_ID, expect.any(String));
    // 869dzymvv: rotating the password invalidates every existing session.
    expect(bumpTokenVersion).toHaveBeenCalledWith(DEMO_ID);
    expect(deliverPasswordChanged).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'requester@demo' }),
    );
  });

  it('rejects a wrong current password without rotating', async () => {
    const service = makeService();
    await expect(service.changePassword(DEMO_ID, 'wrong', 'BrandNew1!')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(setPasswordHash).not.toHaveBeenCalled();
    expect(deliverPasswordChanged).not.toHaveBeenCalled();
  });

  it('rejects when the user no longer exists', async () => {
    const service = makeService({ findById: jest.fn().mockResolvedValue(null) });
    await expect(service.changePassword(DEMO_ID, 'Demo123!', 'BrandNew1!')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
