import { JwtPayload } from '../auth/decorators';
import { ReceivingController } from './receiving.controller';
import { ReceivingService } from './receiving.service';

const user: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000005',
  email: 'warehouse@demo',
  role: 'warehouse',
};

describe('receipt endpoint delegates with the acting warehouse user', () => {
  it('receive passes the payload and actor', async () => {
    const service = {
      receive: jest.fn().mockResolvedValue({ id: 'grn-1' }),
    } as unknown as ReceivingService;
    const controller = new ReceivingController(service);
    const body = {
      poId: '019787c8-0000-4000-8000-00000000abcd',
      lines: [{ poLineId: '019787c8-0000-4000-8000-00000000dcba', quantity: 4 }],
    };
    await controller.receive(user, body);
    expect(service.receive).toHaveBeenCalledWith(body, user.sub);
  });

  it('list passes the poId-scoped pagination query through', async () => {
    const service = {
      listByPo: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    } as unknown as ReceivingService;
    const controller = new ReceivingController(service);
    const query = { page: 1, pageSize: 20, poId: '019787c8-0000-4000-8000-00000000abcd' };
    await controller.list(query);
    expect(service.listByPo).toHaveBeenCalledWith(query);
  });
});
