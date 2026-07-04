import { Queue } from 'bullmq';
import { DIGEST_CRON } from './notifications-digest.constants';
import { NotificationsDigestScheduler } from './notifications-digest.scheduler';
import { OutboundChannel } from './outbound/outbound-channel';

function schedulerWith(channelName: string, add: jest.Mock): NotificationsDigestScheduler {
  const queue = { add } as unknown as Queue;
  const channel = { name: channelName } as unknown as OutboundChannel;
  return new NotificationsDigestScheduler(queue, channel);
}

describe('NotificationsDigestScheduler', () => {
  it('does not schedule the digest when the channel is disabled (none)', async () => {
    const add = jest.fn();
    await schedulerWith('none', add).onModuleInit();
    expect(add).not.toHaveBeenCalled();
  });

  it('schedules a repeatable digest when a channel is configured', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    await schedulerWith('webhook', add).onModuleInit();
    expect(add).toHaveBeenCalledWith(
      'digest',
      {},
      expect.objectContaining({ repeat: { pattern: DIGEST_CRON } }),
    );
  });
});
