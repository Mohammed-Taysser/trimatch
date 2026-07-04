import { ConfigService } from '@nestjs/config';
import { NoopOutboundChannel } from './noop.channel';
import { NotificationDigest, OutboundChannel } from './outbound-channel';
import { outboundChannelProvider } from './outbound-channel.provider';
import { WebhookOutboundChannel } from './webhook.channel';

const digest: NotificationDigest = {
  recipientId: '019787c8-0000-4000-8000-000000000001',
  recipientEmail: 'lead@demo',
  recipientName: 'Lee Lead',
  unread: [
    {
      id: 'n1',
      type: 'requisition.submitted',
      message: 'A requisition awaits your approval',
      createdAt: '2026-07-04T00:00:00.000Z',
    },
  ],
};

function config(env: Record<string, string>): ConfigService {
  return { getOrThrow: (key: string) => env[key] } as unknown as ConfigService;
}

function factory(env: Record<string, string>): OutboundChannel {
  const useFactory = outboundChannelProvider as {
    useFactory: (c: ConfigService) => OutboundChannel;
  };
  return useFactory.useFactory(config(env));
}

describe('outbound channels', () => {
  afterEach(() => jest.restoreAllMocks());

  it('NoopOutboundChannel sends nothing', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await new NoopOutboundChannel().deliver(digest);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('WebhookOutboundChannel POSTs the digest JSON to the configured URL', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    await new WebhookOutboundChannel('https://hooks.example/notify').deliver(digest);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hooks.example/notify',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.recipientId).toBe(digest.recipientId);
    expect(body.unread).toHaveLength(1);
  });

  it('WebhookOutboundChannel throws on a non-2xx response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as unknown as Response);
    await expect(
      new WebhookOutboundChannel('https://hooks.example/notify').deliver(digest),
    ).rejects.toThrow(/503/);
  });

  it('the factory selects the no-op channel for NOTIFICATIONS_CHANNEL=none', () => {
    expect(factory({ NOTIFICATIONS_CHANNEL: 'none' }).name).toBe('none');
  });

  it('NoopOutboundChannel sends no password-reset or password-changed', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const noop = new NoopOutboundChannel();
    await noop.deliverPasswordReset({
      recipientEmail: 'a@demo',
      recipientName: 'A',
      code: '123456',
      expiresAt: '2026-07-04T00:10:00.000Z',
    });
    await noop.deliverPasswordChanged({
      recipientEmail: 'a@demo',
      recipientName: 'A',
      changedAt: '2026-07-04T00:00:00.000Z',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('WebhookOutboundChannel POSTs typed password-reset and password-changed payloads', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    const webhook = new WebhookOutboundChannel('https://hooks.example/notify');
    await webhook.deliverPasswordReset({
      recipientEmail: 'a@demo',
      recipientName: 'A',
      code: '123456',
      expiresAt: '2026-07-04T00:10:00.000Z',
    });
    await webhook.deliverPasswordChanged({
      recipientEmail: 'a@demo',
      recipientName: 'A',
      changedAt: '2026-07-04T00:00:00.000Z',
    });
    const resetBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const changedBody = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string);
    expect(resetBody.type).toBe('password_reset');
    expect(resetBody.code).toBe('123456');
    expect(changedBody.type).toBe('password_changed');
  });

  it('the factory selects the webhook channel when configured', () => {
    const channel = factory({
      NOTIFICATIONS_CHANNEL: 'webhook',
      NOTIFICATIONS_WEBHOOK_URL: 'https://hooks.example/notify',
    });
    expect(channel.name).toBe('webhook');
  });
});
