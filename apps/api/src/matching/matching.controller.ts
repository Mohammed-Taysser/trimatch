import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ExceptionsQuerySchema, MatchRecord } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { MatchingService } from './matching.service';

export class ExceptionsQueryDto extends createZodDto(ExceptionsQuerySchema) {}

@Controller()
@Roles('ap', 'admin')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post('invoices/:id/match')
  @HttpCode(200)
  match(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchRecord> {
    return this.matching.match(id, user.sub);
  }

  @Get('exceptions')
  exceptions(@Query() query: ExceptionsQueryDto) {
    return this.matching.exceptions(query);
  }
}
