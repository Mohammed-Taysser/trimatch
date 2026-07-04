import { JwtPayload } from '../auth/decorators';
import { RequisitionsController } from './requisitions.controller';
import { RequisitionsService } from './requisitions.service';

const user: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000001',
  email: 'requester@demo',
  role: 'requester',
  tv: 0,
};
const REQ_ID = '019787c8-0000-4000-8000-00000000aaaa';

describe('requisition endpoints delegate with the authenticated requester', () => {
  const service = {
    create: jest.fn().mockResolvedValue({ id: REQ_ID }),
    findAllOwn: jest.fn().mockResolvedValue([]),
    findOwn: jest.fn().mockResolvedValue({ id: REQ_ID }),
    update: jest.fn().mockResolvedValue({ id: REQ_ID }),
    remove: jest.fn().mockResolvedValue(undefined),
    submit: jest.fn().mockResolvedValue({ id: REQ_ID, status: 'pending_approval' }),
    revise: jest.fn().mockResolvedValue({ id: REQ_ID, status: 'draft' }),
    findAllAdmin: jest.fn().mockResolvedValue({ items: [], meta: {} }),
  } as unknown as RequisitionsService;
  const controller = new RequisitionsController(service);
  const page = { page: 1, pageSize: 20 };
  const body = {
    justification: 'x',
    neededBy: '2026-08-01',
    currency: 'USD',
    lines: [{ description: 'x', category: 'IT', quantity: 1, unitPriceMinor: 1 }],
  };

  it('create passes the token subject as requester', async () => {
    await controller.create(user, body);
    expect(service.create).toHaveBeenCalledWith(user.sub, body);
  });

  it('submit passes the token subject as requester', async () => {
    await controller.submit(user, REQ_ID);
    expect(service.submit).toHaveBeenCalledWith(REQ_ID, user.sub);
  });

  it('revise passes the token subject as requester', async () => {
    await controller.revise(user, REQ_ID);
    expect(service.revise).toHaveBeenCalledWith(REQ_ID, user.sub);
  });

  it('list/get/update/remove are scoped to the current user', async () => {
    await controller.list(user, page);
    await controller.get(user, REQ_ID);
    await controller.update(user, REQ_ID, body);
    await controller.remove(user, REQ_ID);
    expect(service.findAllOwn).toHaveBeenCalledWith(user.sub, page);
    expect(service.findOwn).toHaveBeenCalledWith(REQ_ID, user.sub);
    expect(service.update).toHaveBeenCalledWith(REQ_ID, user.sub, body);
    expect(service.remove).toHaveBeenCalledWith(REQ_ID, user.sub);
  });

  it('the admin org-wide list passes the status filter through', async () => {
    const query = { page: 1, pageSize: 20, status: 'pending_approval' as const };
    await controller.listAll(query);
    expect(service.findAllAdmin).toHaveBeenCalledWith(query);
  });
});
