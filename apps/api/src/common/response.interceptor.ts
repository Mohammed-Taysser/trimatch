import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { PagedResult } from './paged';

// Fixed success envelope: { data, meta?, message, timestamp, requestId }.
// 204/empty responses stay empty.
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ id?: string | number }>();
    return next.handle().pipe(
      map((payload: unknown) => {
        if (payload === undefined) return payload; // 204 no-content
        const base = {
          message: null,
          timestamp: new Date().toISOString(),
          requestId: String(request.id ?? 'unknown'),
        };
        if (payload instanceof PagedResult) {
          return { data: payload.items, meta: payload.meta, ...base };
        }
        return { data: payload, ...base };
      }),
    );
  }
}
