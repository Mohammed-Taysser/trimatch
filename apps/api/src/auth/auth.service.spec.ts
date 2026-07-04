import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../identity/users.service';
import { OutboundChannel } from '../notifications/outbound/outbound-channel';
import { AuthService } from './auth.service';

const DEMO_ID = '019787c8-0000-4000-8000-000000000001';
const demoUser = {
  id: DEMO_ID,
  email: 'requester@demo',
  fullName: 'Riley Requester',
  role: 'requester',
  passwordHash: bcrypt.hashSync('Demo123!', 4),
};

const deliverPasswordChanged = jest.fn().mockResolvedValue(undefined);
const setPasswordHash = jest.fn().mockResolvedValue(undefined);

function makeService(overrides: Partial<Record<'findByEmail' | 'findById', unknown>> = {}) {
  deliverPasswordChanged.mockClear();
  setPasswordHash.mockClear();
  const users = {
    findByEmail: jest.fn().mockResolvedValue(demoUser),
    findById: jest.fn().mockResolvedValue(demoUser),
    setPasswordHash,
    ...overrides,
  } as unknown as UsersService;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  } as unknown as JwtService;
  const channel = { deliverPasswordChanged } as unknown as OutboundChannel;
  return new AuthService(users, jwt, channel);
}

describe('login returns a JWT for valid demo credentials', () => {
  it('returns a signed token and the auth user', async () => {
    const result = await makeService().login('requester@demo', 'Demo123!');
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
