import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { PagedResult, pageMeta, pageOffset } from './paged';
import { ResponseEnvelopeInterceptor } from './response.interceptor';

const interceptor = new ResponseEnvelopeInterceptor();

function ctx(requestId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ id: requestId }) }),
  } as unknown as ExecutionContext;
}

function handler(payload: unknown): CallHandler {
  return { handle: () => of(payload) };
}

describe('every success response uses the fixed envelope', () => {
  it('wraps plain payloads as { data, message, timestamp, requestId }', async () => {
    const out = (await firstValueFrom(
      interceptor.intercept(ctx('req-1'), handler({ hello: 'world' })),
    )) as Record<string, unknown>;
    expect(out).toMatchObject({ data: { hello: 'world' }, message: null, requestId: 'req-1' });
    expect(typeof out.timestamp).toBe('string');
  });

  it('lifts PagedResult items into data with meta attached', async () => {
    const query = { page: 2, pageSize: 10 };
    const paged = new PagedResult([1, 2, 3], pageMeta(query, 23));
    const out = (await firstValueFrom(
      interceptor.intercept(ctx('req-2'), handler(paged)),
    )) as Record<string, unknown>;
    expect(out).toMatchObject({
      data: [1, 2, 3],
      meta: { page: 2, pageSize: 10, total: 23, totalPages: 3 },
    });
  });

  it('leaves 204 no-content responses untouched', async () => {
    const out = await firstValueFrom(interceptor.intercept(ctx(), handler(undefined)));
    expect(out).toBeUndefined();
  });

  it('falls back to an unknown requestId when the request has none', async () => {
    const out = (await firstValueFrom(
      interceptor.intercept(ctx(undefined), handler('x')),
    )) as Record<string, unknown>;
    expect(out.requestId).toBe('unknown');
  });
});

describe('pagination math', () => {
  it('computes limit/offset from the query', () => {
    expect(pageOffset({ page: 3, pageSize: 20 })).toEqual({ limit: 20, offset: 40 });
  });

  it('computes total pages with a partial last page', () => {
    expect(pageMeta({ page: 1, pageSize: 20 }, 41).totalPages).toBe(3);
    expect(pageMeta({ page: 1, pageSize: 20 }, 0).totalPages).toBe(0);
  });
});
