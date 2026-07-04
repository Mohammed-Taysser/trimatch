import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { NoopOutboundChannel } from './noop.channel';
import { OUTBOUND_CHANNEL, OutboundChannel } from './outbound-channel';
import { WebhookOutboundChannel } from './webhook.channel';

// Selects the outbound channel from env at DI time. Partial config (webhook
// without a URL) is already rejected by the env schema, so getOrThrow is safe.
export const outboundChannelProvider: Provider = {
  provide: OUTBOUND_CHANNEL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): OutboundChannel => {
    const channel = config.getOrThrow<'none' | 'webhook'>('NOTIFICATIONS_CHANNEL');
    if (channel === 'webhook') {
      return new WebhookOutboundChannel(config.getOrThrow<string>('NOTIFICATIONS_WEBHOOK_URL'));
    }
    return new NoopOutboundChannel();
  },
};
