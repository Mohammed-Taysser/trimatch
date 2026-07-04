import { JwtPayload } from '../auth/decorators';
import { DelegationsController } from './delegations.controller';
import { DelegationsService } from './delegations.service';

const approver: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000002',
  email: 'lead@demo',
  role: 'approver',
  tv: 0,
};
const DELEGATION_ID = '019787c8-0000-4000-8000-00000000dddd';

describe('delegation endpoints delegate with the authenticated approver', () => {
  const service = {
    create: jest.fn().mockResolvedValue(undefined),
    listOwn: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    revoke: jest.fn().mockResolvedValue(undefined),
  } as unknown as DelegationsService;
  const controller = new DelegationsController(service);
  const page = { page: 1, pageSize: 20 };

  it('create passes the caller as delegator', async () => {
    await controller.create(approver, {
      delegateEmail: 'peer@demo',
      startsOn: '2026-07-01',
      endsOn: '2026-07-31',
    });
    expect(service.create).toHaveBeenCalledWith(
      approver.sub,
      'peer@demo',
      '2026-07-01',
      '2026-07-31',
    );
  });

  it('list is scoped to the caller', async () => {
    await controller.list(approver, page);
    expect(service.listOwn).toHaveBeenCalledWith(approver.sub, page);
  });

  it('revoke checks ownership via the caller id', async () => {
    await controller.revoke(approver, DELEGATION_ID);
    expect(service.revoke).toHaveBeenCalledWith(DELEGATION_ID, approver.sub);
  });
});
