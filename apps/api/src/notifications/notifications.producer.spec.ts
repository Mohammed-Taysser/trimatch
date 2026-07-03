import { Queue } from 'bullmq';
import { NotificationJob } from '@trimatch/shared';
import { NotificationsProducer } from './notifications.producer';

const JOB: NotificationJob = {
  recipientId: '019787c8-0000-4000-8000-000000000001',
  type: 'requisition.submitted',
  message: 'A requisition awaits your approval',
  entityType: 'requisition',
  entityId: '019787c8-0000-4000-8000-0000000000aa',
};

function producerWith(queue: Partial<Record<string, jest.Mock>>): NotificationsProducer {
  return new NotificationsProducer(queue as unknown as Queue);
}

describe('NotificationsProducer', () => {
  it('emit enqueues the job under its type', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    await producerWith({ add }).emit(JOB);
    expect(add).toHaveBeenCalledWith(
      JOB.type,
      JOB,
      expect.objectContaining({ removeOnComplete: true }),
    );
  });

  it('emit swallows queue failures so the business op is never broken', async () => {
    const add = jest.fn().mockRejectedValue(new Error('redis down'));
    await expect(producerWith({ add }).emit(JOB)).resolves.toBeUndefined();
  });

  it('emitEach fans out one job per recipient', async () => {
    const addBulk = jest.fn().mockResolvedValue(undefined);
    await producerWith({ addBulk }).emitEach(['a', 'b'], (recipientId) => ({
      recipientId,
      type: 'invoice.exception',
      message: 'exception',
    }));
    expect(addBulk).toHaveBeenCalledTimes(1);
    expect(addBulk.mock.calls[0][0]).toHaveLength(2);
  });

  it('emitEach is a no-op for an empty recipient list', async () => {
    const addBulk = jest.fn();
    await producerWith({ addBulk }).emitEach([], () => JOB);
    expect(addBulk).not.toHaveBeenCalled();
  });

  it('emitEach swallows queue failures', async () => {
    const addBulk = jest.fn().mockRejectedValue(new Error('redis down'));
    await expect(
      producerWith({ addBulk }).emitEach(['a'], (recipientId) => ({ ...JOB, recipientId })),
    ).resolves.toBeUndefined();
  });
});
