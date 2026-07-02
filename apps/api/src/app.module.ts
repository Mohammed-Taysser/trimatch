import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/response.interceptor';
import { AppZodValidationPipe } from './common/zod-validation.pipe';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { RequisitionsModule } from './requisitions/requisitions.module';
import { VendorsModule } from './vendors/vendors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    // Structured JSON access logs with one request-id per line (runbook §4):
    // X-Request-Id honored or generated, always echoed back; auth redacted.
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.getOrThrow<string>('NODE_ENV');
        return {
          pinoHttp: {
            level: env === 'test' ? 'silent' : env === 'production' ? 'info' : 'debug',
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const header = req.headers['x-request-id'];
              const id = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            redact: ['req.headers.authorization'],
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url?.startsWith('/api/v1/health') ?? false,
            },
            transport:
              env === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        };
      },
    }),
    DatabaseModule,
    IdentityModule,
    AuthModule,
    RequisitionsModule,
    ApprovalsModule,
    VendorsModule,
    PurchasingModule,
    HealthModule,
  ],
  providers: [
    // Everything is authenticated by default; opt out per route with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Validates every createZodDto-typed param — 422 VALIDATION_ERROR (ADR-0003).
    { provide: APP_PIPE, useClass: AppZodValidationPipe },
    // Fixed response envelope on success and errors (CLAUDE.md API contract).
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
