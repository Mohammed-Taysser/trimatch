import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { EmptyResultError } from 'sequelize';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

// Fixed error envelope: { code, message, details?, timestamp, requestId, path }.
// Machine-readable codes set by services (VALIDATION_ERROR, FORBIDDEN, ...) pass
// through untouched (NFR-05).
//
// 869e01dmy — "not found = error" is handled centrally: a Sequelize
// EmptyResultError (thrown by a finder with `rejectOnEmpty`) becomes a 404 here
// rather than leaking as a 500. Prefer `rejectOnEmpty: new NotFoundException({
// code, message })` for a specific message; plain `rejectOnEmpty: true` falls back
// to this generic 404. Note: reach for `rejectOnEmpty` only when a missing row IS
// an error — for optional/"exists?" lookups keep the nullable finder and branch;
// it is not "always better".
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ id?: string | number; originalUrl?: string; url?: string }>();

    const isEmptyResult = exception instanceof EmptyResultError;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    if (exception instanceof HttpException) status = exception.getStatus();
    else if (isEmptyResult) status = HttpStatus.NOT_FOUND;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const shaped =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

    let fallbackMessage = 'Unexpected error';
    if (isEmptyResult) fallbackMessage = 'Resource not found';
    else if (typeof body === 'string') fallbackMessage = body;

    response.status(status).json({
      code: (shaped.code as string) ?? STATUS_CODES[status] ?? 'INTERNAL_ERROR',
      message: (shaped.message as string) ?? fallbackMessage,
      ...(shaped.details ? { details: shaped.details } : {}),
      timestamp: new Date().toISOString(),
      requestId: String(request.id ?? 'unknown'),
      path: request.originalUrl ?? request.url ?? '',
    });
  }
}
