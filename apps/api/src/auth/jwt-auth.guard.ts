import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../identity/users.service';
import { IS_PUBLIC_KEY, JwtPayload } from './decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: JwtPayload }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing bearer token' });
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }

    // A scoped token (e.g. the 2FA login challenge, 869dzycut) is not a full
    // session — it may only be redeemed at its own endpoint, never here.
    if ((payload as { scope?: unknown }).scope !== undefined) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'This token cannot be used for API access',
      });
    }

    // Session invalidation (869dzymvv): the signature is valid, but a token is
    // only live while the account is still active AND its `tv` claim matches the
    // user's current token_version. A password change/reset or deactivation bumps
    // that counter, instantly revoking every token issued before it.
    const state = await this.users.authState(payload.sub);
    if (!state) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User no longer exists' });
    }
    if (!state.active) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated',
      });
    }
    if (payload.tv !== state.tokenVersion) {
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'Your session has expired — please sign in again',
      });
    }

    request.user = payload;
    return true;
  }
}
