import { LoginResponse } from '@trimatch/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';

const loginResponse: LoginResponse = {
  accessToken: 'signed.jwt.token',
  user: {
    id: '019787c8-0000-4000-8000-000000000001',
    email: 'requester@demo',
    fullName: 'Riley Requester',
    role: 'requester',
  },
};

describe('auth endpoints delegate to the auth service', () => {
  const service = {
    login: jest.fn().mockResolvedValue(loginResponse),
    me: jest.fn().mockResolvedValue(loginResponse.user),
  } as unknown as AuthService;
  const passwordReset = {
    requestReset: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
  } as unknown as PasswordResetService;
  const controller = new AuthController(service, passwordReset);

  it('POST /auth/login returns the login response', async () => {
    await expect(
      controller.login({ email: 'requester@demo', password: 'Demo123!' }),
    ).resolves.toEqual(loginResponse);
  });

  it('GET /auth/me resolves the token subject', async () => {
    await expect(
      controller.me({ sub: loginResponse.user.id, email: 'requester@demo', role: 'requester' }),
    ).resolves.toEqual(loginResponse.user);
  });

  it('POST /auth/forgot-password acks without revealing the account', async () => {
    await expect(controller.forgotPassword({ email: 'requester@demo' })).resolves.toEqual({
      ok: true,
    });
    expect(passwordReset.requestReset).toHaveBeenCalledWith('requester@demo');
  });

  it('POST /auth/reset-password delegates the code + new password', async () => {
    await expect(
      controller.resetPassword({
        email: 'requester@demo',
        code: '123456',
        newPassword: 'BrandNew1!',
      }),
    ).resolves.toEqual({ ok: true });
    expect(passwordReset.resetPassword).toHaveBeenCalledWith(
      'requester@demo',
      '123456',
      'BrandNew1!',
    );
  });
});
