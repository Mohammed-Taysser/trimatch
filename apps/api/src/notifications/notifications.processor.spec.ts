import { Job } from 'bullmq';
import { NotificationsProcessor } from './notifications.processor';

describe('NotificationsProcessor', () => {
  const processor = new NotificationsProcessor();

  it('handles a job and reports it processed', async () => {
    const result = await processor.process({ name: 'smoke', id: '42' } as Job);
    expect(result).toEqual({ handled: true });
  });

  it('handles a job without an id', async () => {
    const result = await processor.process({ name: 'smoke' } as Job);
    expect(result).toEqual({ handled: true });
  });
});
