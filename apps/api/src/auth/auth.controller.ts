import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthUser, LoginResult, PasswordResetAck } from '@trimatch/shared';
import { SensitiveThrottle } from '../common/sensitive-throttle.decorator';
import { AuthService } from './auth.service';
import { CurrentUser, JwtPayload, Public } from './decorators';
import { ChangePasswordDto, ForgotPasswordDto, LoginRequestDto, ResetPasswordDto } from './dto';
import { PasswordResetService } from './password-reset.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  // Credential endpoint — the stricter "auth" rate limit applies here
  // (brute-force protection), on top of the global per-IP limit.
  @Public()
  @SensitiveThrottle()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginRequestDto): Promise<LoginResult> {
    return this.auth.login(body.email, body.password);
  }

  // Always acks the same, whether or not the email exists (no enumeration).
  @Public()
  @SensitiveThrottle()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<PasswordResetAck> {
    await this.passwordReset.requestReset(body.email);
    return { ok: true };
  }

  @Public()
  @SensitiveThrottle()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<PasswordResetAck> {
    await this.passwordReset.resetPassword(body.email, body.code, body.newPassword);
    return { ok: true };
  }

  // Authenticated — a signed-in user rotates their own password (current
  // password required); the stricter auth rate limit applies.
  @SensitiveThrottle()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() body: ChangePasswordDto,
  ): Promise<PasswordResetAck> {
    await this.auth.changePassword(user.sub, body.currentPassword, body.newPassword);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload): Promise<AuthUser> {
    return this.auth.me(user.sub);
  }
}
