import { Notification } from './notification.model';
import { NotificationsDigestService } from './notifications-digest.service';
import { OutboundChannel } from './outbound/outbound-channel';

function row(id: string, recipientId: string, recipient: unknown) {
  return {
    id,
    recipientId,
    recipient,
    type: 'requisition.submitted',
    message: `msg ${id}`,
    createdAt: new Date('2026-07-04T00:00:00.000Z'),
  };
}

const userA = { email: 'a@demo', fullName: 'Ann' };
const userB = { email: 'b@demo', fullName: 'Bob' };

function serviceWith(
  rows: unknown[],
  deliver: jest.Mock,
): { service: NotificationsDigestService; deliver: jest.Mock } {
  const model = { findAll: jest.fn().mockResolvedValue(rows) } as unknown as typeof Notification;
  const channel = { name: 'webhook', deliver } as unknown as OutboundChannel;
  return { service: new NotificationsDigestService(model, channel), deliver };
}

describe('NotificationsDigestService', () => {
  it('batches unread per recipient into one digest each', async () => {
    const deliver = jest.fn().mockResolvedValue(undefined);
    const { service } = serviceWith(
      [row('n1', 'A', userA), row('n2', 'A', userA), row('n3', 'B', userB)],
      deliver,
    );
    const summary = await service.runDigest();
    expect(summary).toEqual({ recipients: 2, delivered: 2 });
    expect(deliver).toHaveBeenCalledTimes(2);
    const toA = deliver.mock.calls.find((call) => call[0].recipientId === 'A')?.[0];
    expect(toA.recipientEmail).toBe('a@demo');
    expect(toA.unread).toHaveLength(2);
  });

  it('isolates a per-recipient delivery failure', async () => {
    const deliver = jest
      .fn()
      .mockImplementation((digest: { recipientId: string }) =>
        digest.recipientId === 'A' ? Promise.reject(new Error('boom')) : Promise.resolve(),
      );
    const { service } = serviceWith([row('n1', 'A', userA), row('n2', 'B', userB)], deliver);
    const summary = await service.runDigest();
    expect(summary).toEqual({ recipients: 2, delivered: 1 });
  });

  it('skips a notification whose recipient is missing', async () => {
    const deliver = jest.fn().mockResolvedValue(undefined);
    const { service } = serviceWith([row('n1', 'A', undefined)], deliver);
    const summary = await service.runDigest();
    expect(deliver).not.toHaveBeenCalled();
    expect(summary).toEqual({ recipients: 1, delivered: 0 });
  });
});
