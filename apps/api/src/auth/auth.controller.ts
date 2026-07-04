import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthUser, LoginResponse } from '@trimatch/shared';
import { SensitiveThrottle } from '../common/sensitive-throttle.decorator';
import { AuthService } from './auth.service';
import { CurrentUser, JwtPayload, Public } from './decorators';
import { LoginRequestDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Credential endpoint — the stricter "auth" rate limit applies here
  // (brute-force protection), on top of the global per-IP limit.
  @Public()
  @SensitiveThrottle()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginRequestDto): Promise<LoginResponse> {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload): Promise<AuthUser> {
    return this.auth.me(user.sub);
  }
}
