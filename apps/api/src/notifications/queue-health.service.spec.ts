import { Queue } from 'bullmq';
import { QueueHealth } from './queue-health.service';

function healthWith(client: Promise<unknown>): QueueHealth {
  return new QueueHealth({ client } as unknown as Queue);
}

describe('QueueHealth', () => {
  describe('isReady — queue connection status', () => {
    it('is ready when the queue connection reports ready', async () => {
      expect(await healthWith(Promise.resolve({ status: 'ready' })).isReady()).toBe(true);
    });

    it('is not ready when the connection is still connecting', async () => {
      expect(await healthWith(Promise.resolve({ status: 'connecting' })).isReady()).toBe(false);
    });

    it('is not ready when acquiring the connection fails', async () => {
      expect(await healthWith(Promise.reject(new Error('redis down'))).isReady()).toBe(false);
    });
  });

  describe('pingRedis — real Redis PING over the connection', () => {
    it('is up when Redis answers PONG', async () => {
      const health = healthWith(Promise.resolve({ ping: () => Promise.resolve('PONG') }));
      expect(await health.pingRedis()).toBe(true);
    });

    it('is down when Redis answers something other than PONG', async () => {
      const health = healthWith(Promise.resolve({ ping: () => Promise.resolve('LOADING') }));
      expect(await health.pingRedis()).toBe(false);
    });

    it('is down when the PING rejects', async () => {
      const health = healthWith(Promise.resolve({ ping: () => Promise.reject(new Error('nope')) }));
      expect(await health.pingRedis()).toBe(false);
    });

    it('is down when acquiring the connection fails', async () => {
      expect(await healthWith(Promise.reject(new Error('redis down'))).pingRedis()).toBe(false);
    });
  });
});
