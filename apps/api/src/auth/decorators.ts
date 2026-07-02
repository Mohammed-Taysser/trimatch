import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '@trimatch/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export function currentUserFactory(_data: unknown, ctx: ExecutionContext): JwtPayload {
  const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
  return request.user;
}

export const CurrentUser = createParamDecorator(currentUserFactory);
