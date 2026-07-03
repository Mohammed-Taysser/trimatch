import { JwtPayload } from '../auth/decorators';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const admin: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000001',
  email: 'admin@demo',
  role: 'admin',
};
const USER_ID = '019787c8-0000-4000-8000-00000000aaaa';

describe('user management endpoints delegate with the acting admin', () => {
  const service = {
    listAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    update: jest.fn().mockResolvedValue({ id: USER_ID, role: 'approver' }),
  } as unknown as UsersService;
  const controller = new UsersController(service);
  const page = { page: 1, pageSize: 20 };

  it('list passes the pagination query through', async () => {
    await controller.list(page);
    expect(service.listAll).toHaveBeenCalledWith(page);
  });

  it('update carries the target, the change and the acting admin', async () => {
    const change = { role: 'approver' as const };
    await controller.update(admin, USER_ID, change);
    expect(service.update).toHaveBeenCalledWith(USER_ID, change, admin.sub);
  });
});
