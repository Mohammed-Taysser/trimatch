import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  LoginResponse,
  TwoFactorDisableSchema,
  TwoFactorEnableResponse,
  TwoFactorEnableSchema,
  TwoFactorSetupResponse,
  TwoFactorVerifySchema,
} from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { SensitiveThrottle } from '../common/sensitive-throttle.decorator';
import { AuthService } from './auth.service';
import { CurrentUser, JwtPayload, Public } from './decorators';
import { TwoFactorService } from './two-factor.service';

export class TwoFactorEnableDto extends createZodDto(TwoFactorEnableSchema) {}
export class TwoFactorVerifyDto extends createZodDto(TwoFactorVerifySchema) {}
export class TwoFactorDisableDto extends createZodDto(TwoFactorDisableSchema) {}

// Optional TOTP 2FA (869dzycut). Enrolment/teardown are authenticated; the login
// second-factor exchange is public (it carries its own short-lived challenge).
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Post('setup')
  @HttpCode(200)
  setup(@CurrentUser() user: JwtPayload): Promise<TwoFactorSetupResponse> {
    return this.twoFactor.setup(user.sub);
  }

  @SensitiveThrottle()
  @Post('enable')
  @HttpCode(200)
  enable(
    @CurrentUser() user: JwtPayload,
    @Body() body: TwoFactorEnableDto,
  ): Promise<TwoFactorEnableResponse> {
    return this.twoFactor.enable(user.sub, body.code);
  }

  @SensitiveThrottle()
  @Post('disable')
  @HttpCode(200)
  async disable(
    @CurrentUser() user: JwtPayload,
    @Body() body: TwoFactorDisableDto,
  ): Promise<{ ok: true }> {
    await this.twoFactor.disable(user.sub, body.code);
    return { ok: true };
  }

  // Login second factor: redeem the challenge from POST /auth/login for a session.
  @Public()
  @SensitiveThrottle()
  @Post('verify')
  @HttpCode(200)
  verify(@Body() body: TwoFactorVerifyDto): Promise<LoginResponse> {
    return this.auth.verifyTwoFactor(body.challenge, body.code);
  }
}
