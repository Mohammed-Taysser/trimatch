import { Job } from 'bullmq';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

const VALID_JOB = {
  recipientId: '019787c8-0000-4000-8000-000000000001',
  type: 'requisition.approved',
  message: 'Your requisition was approved',
};

describe('NotificationsProcessor', () => {
  it('validates the payload and persists a notification', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'n1' });
    const processor = new NotificationsProcessor({ create } as unknown as NotificationsService);

    const result = await processor.process({ data: VALID_JOB } as Job);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'requisition.approved' }));
    expect(result).toEqual({ handled: true, id: 'n1' });
  });

  it('rejects a malformed payload without persisting', async () => {
    const create = jest.fn();
    const processor = new NotificationsProcessor({ create } as unknown as NotificationsService);

    await expect(processor.process({ data: { ping: true } } as Job)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
