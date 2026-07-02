import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { currentUserFactory, JwtPayload } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const payload: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000001',
  email: 'requester@demo',
  role: 'requester',
};

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: unknown): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(value) } as unknown as Reflector;
}

describe('protected routes require a valid bearer token', () => {
  const jwtAccepting = {
    verifyAsync: jest.fn().mockResolvedValue(payload),
  } as unknown as JwtService;
  const jwtRejecting = {
    verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')),
  } as unknown as JwtService;

  it('lets @Public() routes through without a token', async () => {
    const guard = new JwtAuthGuard(jwtRejecting, reflectorReturning(true));
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('rejects a missing token with 401 UNAUTHORIZED', async () => {
    const guard = new JwtAuthGuard(jwtAccepting, reflectorReturning(undefined));
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid token with 401 UNAUTHORIZED', async () => {
    const guard = new JwtAuthGuard(jwtRejecting, reflectorReturning(undefined));
    const ctx = contextFor({ headers: { authorization: 'Bearer nope' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the decoded payload as request.user on success', async () => {
    const guard = new JwtAuthGuard(jwtAccepting, reflectorReturning(undefined));
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer good' } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });
});

describe('@Roles() rejects the wrong role with 403 FORBIDDEN', () => {
  it('allows routes without role metadata', () => {
    const guard = new RolesGuard(reflectorReturning(undefined));
    expect(guard.canActivate(contextFor({ user: payload }))).toBe(true);
  });

  it('allows a matching role', () => {
    const guard = new RolesGuard(reflectorReturning(['requester']));
    expect(guard.canActivate(contextFor({ user: payload }))).toBe(true);
  });

  it('rejects a non-matching role with FORBIDDEN', () => {
    const guard = new RolesGuard(reflectorReturning(['purchasing']));
    expect(() => guard.canActivate(contextFor({ user: payload }))).toThrow(ForbiddenException);
  });

  it('rejects when no user is attached', () => {
    const guard = new RolesGuard(reflectorReturning(['requester']));
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });
});

describe('CurrentUser decorator', () => {
  it('extracts request.user', () => {
    expect(currentUserFactory(undefined, contextFor({ user: payload }))).toEqual(payload);
  });
});
