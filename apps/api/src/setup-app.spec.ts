import { INestApplication } from '@nestjs/common';
import { applyTrustProxy } from './setup-app';

// 869dzymvw: the bootstrap must push the configured hop count onto the underlying
// Express instance so per-IP rate limiting reads X-Forwarded-For behind nginx.
describe('applyTrustProxy wires the hop count onto the Express instance', () => {
  function appWithSpy(set: jest.Mock): INestApplication {
    return {
      getHttpAdapter: () => ({ getInstance: () => ({ set }) }),
    } as unknown as INestApplication;
  }

  it('sets Express `trust proxy` to the given number of hops', () => {
    const set = jest.fn();
    applyTrustProxy(appWithSpy(set), 1);
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
  });

  it('passes 0 through unchanged (trust no proxy)', () => {
    const set = jest.fn();
    applyTrustProxy(appWithSpy(set), 0);
    expect(set).toHaveBeenCalledWith('trust proxy', 0);
  });
});
