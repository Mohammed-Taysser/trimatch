import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetOtp } from './password-reset-otp.model';
import { PasswordResetService } from './password-reset.service';
import { TotpCipher } from './totp-cipher';
import { TwoFactorRecoveryCode } from './two-factor-recovery-code.model';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

// jsonwebtoken types expiresIn as an ms.StringValue union; the env schema
// guarantees a non-empty duration string like "8h".
type ExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN') as ExpiresIn,
        },
      }),
    }),
    IdentityModule,
    NotificationsModule,
    SettingsModule,
    SequelizeModule.forFeature([PasswordResetOtp, TwoFactorRecoveryCode]),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [AuthService, PasswordResetService, TwoFactorService, TotpCipher],
})
export class AuthModule {}
