import { AuthService } from './auth.service';
import { JwtPayload } from './decorators';
import {
  TwoFactorController,
  TwoFactorDisableDto,
  TwoFactorEnableDto,
  TwoFactorVerifyDto,
} from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

const user: JwtPayload = { sub: 'u1', email: 'user@demo', role: 'requester', tv: 0 };

describe('TwoFactorController delegates to the services with the current user', () => {
  const twoFactor = {
    setup: jest.fn().mockResolvedValue({ otpauthUri: 'otpauth://x', secret: 's' }),
    enable: jest.fn().mockResolvedValue({ recoveryCodes: [] }),
    disable: jest.fn().mockResolvedValue(undefined),
  } as unknown as TwoFactorService;
  const auth = {
    verifyTwoFactor: jest.fn().mockResolvedValue({ accessToken: 't', user: {} }),
  } as unknown as AuthService;
  const controller = new TwoFactorController(auth, twoFactor);

  it('setup passes the current user id', async () => {
    await controller.setup(user);
    expect(twoFactor.setup).toHaveBeenCalledWith('u1');
  });

  it('enable passes the user id and code', async () => {
    await controller.enable(user, { code: '123456' } as TwoFactorEnableDto);
    expect(twoFactor.enable).toHaveBeenCalledWith('u1', '123456');
  });

  it('disable passes the user id and code and returns ok', async () => {
    await expect(
      controller.disable(user, { code: '123456' } as TwoFactorDisableDto),
    ).resolves.toEqual({ ok: true });
    expect(twoFactor.disable).toHaveBeenCalledWith('u1', '123456');
  });

  it('verify delegates the challenge and code to the auth service', async () => {
    await controller.verify({ challenge: 'c', code: '123456' } as TwoFactorVerifyDto);
    expect(auth.verifyTwoFactor).toHaveBeenCalledWith('c', '123456');
  });
});
