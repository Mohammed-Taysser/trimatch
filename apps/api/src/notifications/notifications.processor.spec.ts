import { Job } from 'bullmq';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

const VALID_JOB = {
  recipientId: '019787c8-0000-4000-8000-000000000001',
  type: 'requisition.approved',
  message: 'Your requisition was approved',
};

function processorWith(create: jest.Mock, emitToUser: jest.Mock): NotificationsProcessor {
  return new NotificationsProcessor(
    { create } as unknown as NotificationsService,
    { emitToUser } as unknown as NotificationsGateway,
  );
}

describe('NotificationsProcessor', () => {
  it('persists a notification and pushes it to the recipient socket', async () => {
    const created = { id: 'n1', recipientId: '019787c8-0000-4000-8000-000000000001' };
    const create = jest.fn().mockResolvedValue(created);
    const emitToUser = jest.fn();
    const processor = processorWith(create, emitToUser);

    const result = await processor.process({ data: VALID_JOB } as Job);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'requisition.approved' }));
    expect(emitToUser).toHaveBeenCalledWith(created.recipientId, created);
    expect(result).toEqual({ handled: true, id: 'n1' });
  });

  it('rejects a malformed payload without persisting or emitting', async () => {
    const create = jest.fn();
    const emitToUser = jest.fn();
    const processor = processorWith(create, emitToUser);

    await expect(processor.process({ data: { ping: true } } as Job)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
  });
});
