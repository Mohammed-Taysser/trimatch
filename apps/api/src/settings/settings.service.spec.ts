import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Setting } from './setting.model';
import { SettingsService } from './settings.service';

function makeService(rows: { user?: { value: unknown }; company?: { value: unknown } } = {}) {
  const upserted = { update: jest.fn().mockResolvedValue(undefined) };
  const model = {
    findOne: jest.fn(({ where }: { where: { scope: string } }) =>
      Promise.resolve((where.scope === 'user' ? rows.user : rows.company) ?? null),
    ),
    findOrCreate: jest.fn().mockResolvedValue([upserted, true]),
  } as unknown as typeof Setting;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new SettingsService(model, audit), model, audit };
}

describe('SettingsService resolves user -> company -> default', () => {
  it('getCompany returns the code default when nothing is stored', async () => {
    expect(await makeService().service.getCompany('security.require2fa')).toBe(false);
  });

  it('getCompany returns the stored company value', async () => {
    const { service } = makeService({ company: { value: true } });
    expect(await service.getCompany('security.require2fa')).toBe(true);
  });

  it('getForUser prefers the user override over company and default', async () => {
    const { service } = makeService({ user: { value: false }, company: { value: true } });
    expect(await service.getForUser('notifications.emailEnabled', 'u1')).toBe(false);
  });

  it('getForUser falls back to the company value, then the default', async () => {
    const company = makeService({ company: { value: false } });
    expect(await company.service.getForUser('notifications.emailEnabled', 'u1')).toBe(false);
    const neither = makeService();
    expect(await neither.service.getForUser('notifications.emailEnabled', 'u1')).toBe(true);
  });

  it('ignores a user override for a company-only setting', async () => {
    const { service } = makeService({ user: { value: true }, company: { value: false } });
    expect(await service.getForUser('security.require2fa', 'u1')).toBe(false);
  });
});

describe('SettingsService writes validate against the registry', () => {
  it('setCompany stores a valid value and audits it', async () => {
    const { service, model, audit } = makeService();
    const view = await service.setCompany('security.require2fa', true, 'admin-1');
    expect(view.value).toBe(true);
    expect(model.findOrCreate).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'setting.company_changed', actorId: 'admin-1' }),
    );
  });

  it('rejects a value of the wrong type', async () => {
    await expect(
      makeService().service.setCompany('security.require2fa', 'yes', 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown key with 404', async () => {
    await expect(
      makeService().service.setCompany('nope.unknown', true, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects setting a company-only key at user scope', async () => {
    await expect(
      makeService().service.setForUser('security.require2fa', true, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setForUser stores a user preference', async () => {
    const { service, model } = makeService();
    const view = await service.setForUser('notifications.emailEnabled', false, 'u1');
    expect(view.value).toBe(false);
    expect(model.findOrCreate).toHaveBeenCalled();
  });
});

describe('SettingsService views list effective values', () => {
  it('companyView lists company-settable keys with their effective values', async () => {
    const view = await makeService().service.companyView();
    expect(view.map((v) => v.key)).toEqual(
      expect.arrayContaining(['security.require2fa', 'notifications.emailEnabled']),
    );
    expect(view.find((v) => v.key === 'security.require2fa')?.value).toBe(false); // default
  });

  it('userView lists only the user-settable keys', async () => {
    const view = await makeService().service.userView('u1');
    expect(view.map((v) => v.key)).toEqual(['notifications.emailEnabled']);
    expect(view[0].value).toBe(true); // default
  });
});
