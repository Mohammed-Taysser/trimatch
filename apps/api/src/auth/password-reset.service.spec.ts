import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../identity/users.service';
import { OutboundChannel } from '../notifications/outbound/outbound-channel';
import { PasswordResetOtp } from './password-reset-otp.model';
import { PasswordResetService } from './password-reset.service';

const USER = {
  id: 'u1',
  email: 'requester@demo',
  fullName: 'Riley',
  passwordHash: 'old',
  active: true,
};

function build(overrides: { user?: unknown; otpRow?: unknown }): {
  service: PasswordResetService;
  otps: Record<string, jest.Mock>;
  users: Record<string, jest.Mock>;
  deliverPasswordReset: jest.Mock;
} {
  const otps = {
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue(overrides.otpRow ?? null),
  };
  const users = {
    findByEmail: jest.fn().mockResolvedValue(overrides.user ?? null),
    setPasswordHash: jest.fn().mockResolvedValue(undefined),
    bumpTokenVersion: jest.fn().mockResolvedValue(undefined),
  };
  const deliverPasswordReset = jest.fn().mockResolvedValue(undefined);
  const channel = { name: 'test', deliverPasswordReset } as unknown as OutboundChannel;
  const service = new PasswordResetService(
    otps as unknown as typeof PasswordResetOtp,
    users as unknown as UsersService,
    channel,
  );
  return { service, otps, users, deliverPasswordReset };
}

function otpRow(codeHash: string, attempts = 0) {
  return { codeHash, attempts, update: jest.fn().mockResolvedValue(undefined) };
}

describe('PasswordResetService', () => {
  describe('requestReset', () => {
    it('is a silent no-op for an unknown email (no enumeration)', async () => {
      const { service, otps, deliverPasswordReset } = build({ user: null });
      await service.requestReset('nobody@demo');
      expect(otps.create).not.toHaveBeenCalled();
      expect(deliverPasswordReset).not.toHaveBeenCalled();
    });

    // ADR-0007: a deactivated account is indistinguishable from an unknown one.
    it('is a silent no-op for a deactivated account', async () => {
      const { service, otps, deliverPasswordReset } = build({ user: { ...USER, active: false } });
      await service.requestReset(USER.email);
      expect(otps.create).not.toHaveBeenCalled();
      expect(deliverPasswordReset).not.toHaveBeenCalled();
    });

    it('supersedes prior OTPs, stores a hash (not the code) and delivers a 6-digit code', async () => {
      const { service, otps, deliverPasswordReset } = build({ user: USER });
      await service.requestReset(USER.email);
      expect(otps.update).toHaveBeenCalledWith(
        { usedAt: expect.any(Date) },
        { where: { userId: USER.id, usedAt: null } },
      );
      const stored = otps.create.mock.calls[0][0];
      const delivered = deliverPasswordReset.mock.calls[0][0];
      expect(delivered.code).toMatch(/^\d{6}$/);
      expect(stored.codeHash).not.toEqual(delivered.code); // hashed, never the plain code
      expect(await bcrypt.compare(delivered.code, stored.codeHash)).toBe(true);
      expect(delivered.recipientEmail).toBe(USER.email);
    });
  });

  describe('resetPassword', () => {
    const throws = (p: Promise<unknown>) => expect(p).rejects.toThrow(UnauthorizedException);

    it('rejects an unknown email without rotating', async () => {
      const { service, users } = build({ user: null });
      await throws(service.resetPassword('nobody@demo', '123456', 'NewPass1!'));
      expect(users.setPasswordHash).not.toHaveBeenCalled();
    });

    it('rejects when there is no active OTP', async () => {
      const { service } = build({ user: USER, otpRow: null });
      await throws(service.resetPassword(USER.email, '123456', 'NewPass1!'));
    });

    it('rotates the password and burns the OTP on the correct code', async () => {
      const row = otpRow(await bcrypt.hash('123456', 10));
      const { service, users } = build({ user: USER, otpRow: row });
      await service.resetPassword(USER.email, '123456', 'NewPass1!');
      expect(users.setPasswordHash).toHaveBeenCalledWith(USER.id, expect.any(String));
      // 869dzymvv: a reset revokes every existing session for the account.
      expect(users.bumpTokenVersion).toHaveBeenCalledWith(USER.id);
      expect(row.update).toHaveBeenCalledWith({ usedAt: expect.any(Date) });
    });

    it('increments attempts and rejects a wrong code (no rotation)', async () => {
      const row = otpRow(await bcrypt.hash('123456', 10), 1);
      const { service, users } = build({ user: USER, otpRow: row });
      await throws(service.resetPassword(USER.email, '000000', 'NewPass1!'));
      expect(row.update).toHaveBeenCalledWith({ attempts: 2 });
      expect(users.setPasswordHash).not.toHaveBeenCalled();
    });

    it('burns the OTP and rejects after too many attempts', async () => {
      const row = otpRow(await bcrypt.hash('123456', 10), 5);
      const { service, users } = build({ user: USER, otpRow: row });
      await throws(service.resetPassword(USER.email, '123456', 'NewPass1!'));
      expect(row.update).toHaveBeenCalledWith({ usedAt: expect.any(Date) });
      expect(users.setPasswordHash).not.toHaveBeenCalled();
    });
  });
});
