import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { EmptyResultError } from 'sequelize';
import { HttpExceptionFilter } from './http-exception.filter';

const filter = new HttpExceptionFilter();

function run(exception: unknown): { status: number; body: Record<string, unknown> } {
  const result = { status: 0, body: {} as Record<string, unknown> };
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      result.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ id: 'req-9', originalUrl: '/api/v1/things' }),
    }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  return result;
}

describe('every error response uses the fixed envelope', () => {
  it('passes service-set machine-readable codes through', () => {
    const { status, body } = run(
      new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'nope',
        details: [{ path: 'x', message: 'y' }],
      }),
    );
    expect(status).toBe(403);
    expect(body).toMatchObject({
      code: 'FORBIDDEN',
      message: 'nope',
      details: [{ path: 'x', message: 'y' }],
      requestId: 'req-9',
      path: '/api/v1/things',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('maps codeless HttpExceptions from their status', () => {
    const { status, body } = run(new NotFoundException());
    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('shapes unexpected errors as 500 INTERNAL_ERROR', () => {
    const { status, body } = run(new Error('boom'));
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Unexpected error' });
  });

  it('maps a Sequelize EmptyResultError to 404 NOT_FOUND (869e01dmy)', () => {
    const { status, body } = run(new EmptyResultError('no rows'));
    expect(status).toBe(404);
    expect(body).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found' });
  });

  it('maps a 429 (rate limit) to TOO_MANY_REQUESTS in the envelope', () => {
    const { status, body } = run(
      new HttpException('Too many requests — please slow down.', HttpStatus.TOO_MANY_REQUESTS),
    );
    expect(status).toBe(429);
    expect(body).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests — please slow down.',
      path: '/api/v1/things',
    });
  });
});
