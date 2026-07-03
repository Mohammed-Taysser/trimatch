import { JwtPayload } from '../auth/decorators';
import { NotificationsQueryDto } from './dto';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const user = {
  sub: '019787c8-0000-4000-8000-000000000001',
  email: 'a@demo',
  role: 'requester',
} as JwtPayload;

describe('NotificationsController', () => {
  it('list delegates to findAllOwn scoped to the current user', async () => {
    const findAllOwn = jest.fn().mockResolvedValue({ items: [], meta: {} });
    const controller = new NotificationsController({
      findAllOwn,
    } as unknown as NotificationsService);
    const query = { page: 1, pageSize: 20, unread: true } as unknown as NotificationsQueryDto;
    await controller.list(user, query);
    expect(findAllOwn).toHaveBeenCalledWith(user.sub, query);
  });

  it('markRead delegates scoped to the current user', async () => {
    const markRead = jest.fn().mockResolvedValue({ id: 'n1', read: true });
    const controller = new NotificationsController({ markRead } as unknown as NotificationsService);
    await controller.markRead(user, 'n1');
    expect(markRead).toHaveBeenCalledWith('n1', user.sub);
  });
});
