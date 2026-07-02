import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AppZodValidationPipe } from './common/zod-validation.pipe';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { RequisitionsModule } from './requisitions/requisitions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    IdentityModule,
    AuthModule,
    RequisitionsModule,
    ApprovalsModule,
    HealthModule,
  ],
  providers: [
    // Everything is authenticated by default; opt out per route with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Validates every createZodDto-typed param — 422 VALIDATION_ERROR (ADR-0003).
    { provide: APP_PIPE, useClass: AppZodValidationPipe },
  ],
})
export class AppModule {}
