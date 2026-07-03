import { Queue } from 'bullmq';
import { QueueHealth } from './queue-health.service';

function healthWith(client: Promise<{ status: string }>): QueueHealth {
  return new QueueHealth({ client } as unknown as Queue);
}

describe('QueueHealth', () => {
  it('is ready when the queue connection reports ready', async () => {
    const health = healthWith(Promise.resolve({ status: 'ready' }));
    expect(await health.isReady()).toBe(true);
  });

  it('is not ready when the connection is still connecting', async () => {
    const health = healthWith(Promise.resolve({ status: 'connecting' }));
    expect(await health.isReady()).toBe(false);
  });

  it('is not ready when acquiring the connection fails', async () => {
    const health = healthWith(Promise.reject(new Error('redis down')));
    expect(await health.isReady()).toBe(false);
  });
});
