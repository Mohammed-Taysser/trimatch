import { JwtPayload } from '../auth/decorators';
import { SettingsController, SettingUpdateDto } from './settings.controller';
import { SettingsService } from './settings.service';

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@demo', role: 'admin', tv: 0 };
const user: JwtPayload = { sub: 'u1', email: 'u@demo', role: 'requester', tv: 0 };

describe('SettingsController delegates to the service with the caller', () => {
  const service = {
    companyView: jest.fn().mockResolvedValue([]),
    setCompany: jest.fn().mockResolvedValue({ key: 'k', value: true }),
    userView: jest.fn().mockResolvedValue([]),
    setForUser: jest.fn().mockResolvedValue({ key: 'k', value: false }),
  } as unknown as SettingsService;
  const controller = new SettingsController(service);

  it('company lists the company settings', async () => {
    await controller.company();
    expect(service.companyView).toHaveBeenCalled();
  });

  it('setCompany passes key, value and the acting admin', async () => {
    await controller.setCompany(admin, 'security.require2fa', { value: true } as SettingUpdateDto);
    expect(service.setCompany).toHaveBeenCalledWith('security.require2fa', true, 'admin-1');
  });

  it('me lists the caller preferences', async () => {
    await controller.me(user);
    expect(service.userView).toHaveBeenCalledWith('u1');
  });

  it('setMine passes key, value and the caller id', async () => {
    await controller.setMine(user, 'notifications.emailEnabled', {
      value: false,
    } as SettingUpdateDto);
    expect(service.setForUser).toHaveBeenCalledWith('notifications.emailEnabled', false, 'u1');
  });
});
