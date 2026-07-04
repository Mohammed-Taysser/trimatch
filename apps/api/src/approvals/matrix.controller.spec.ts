import { JwtPayload } from '../auth/decorators';
import { MatrixController } from './matrix.controller';
import { MatrixService } from './matrix.service';

const admin: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000001',
  email: 'admin@demo',
  role: 'admin',
  tv: 0,
};

describe('matrix endpoints delegate with the acting admin', () => {
  const service = {
    activeRuleset: jest.fn().mockResolvedValue({ version: 1, rules: [] }),
    createVersion: jest.fn().mockResolvedValue({ version: 2, rules: [] }),
  } as unknown as MatrixService;
  const controller = new MatrixController(service);

  it('active returns the current ruleset', async () => {
    await controller.active();
    expect(service.activeRuleset).toHaveBeenCalled();
  });

  it('createVersion passes the ruleset and the acting admin', async () => {
    const body = {
      rules: [
        {
          ruleLabel: 'R1',
          kind: 'base' as const,
          minAmountMinor: 0,
          maxAmountMinor: 500_00,
          department: null,
          category: null,
          chain: ['Team Lead'],
        },
      ],
    };
    await controller.createVersion(admin, body);
    expect(service.createVersion).toHaveBeenCalledWith(body, admin.sub);
  });
});
