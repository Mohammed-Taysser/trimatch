import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

// Fixed error envelope: { code, message, details?, timestamp, requestId, path }.
// Machine-readable codes set by services (VALIDATION_ERROR, FORBIDDEN, ...) pass
// through untouched (NFR-05).
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ id?: string | number; originalUrl?: string; url?: string }>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const shaped =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

    response.status(status).json({
      code: (shaped.code as string) ?? STATUS_CODES[status] ?? 'INTERNAL_ERROR',
      message: (shaped.message as string) ?? (typeof body === 'string' ? body : 'Unexpected error'),
      ...(shaped.details ? { details: shaped.details } : {}),
      timestamp: new Date().toISOString(),
      requestId: String(request.id ?? 'unknown'),
      path: request.originalUrl ?? request.url ?? '',
    });
  }
}
