import { NotificationsDigestProcessor } from './notifications-digest.processor';
import { NotificationsDigestService } from './notifications-digest.service';

describe('NotificationsDigestProcessor', () => {
  it('runs the digest when the repeatable job fires', async () => {
    const runDigest = jest.fn().mockResolvedValue({ recipients: 3, delivered: 3 });
    const processor = new NotificationsDigestProcessor({
      runDigest,
    } as unknown as NotificationsDigestService);
    await expect(processor.process()).resolves.toEqual({ recipients: 3, delivered: 3 });
    expect(runDigest).toHaveBeenCalledTimes(1);
  });
});
