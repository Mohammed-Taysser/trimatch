import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CreditNoteApplySchema,
  ExceptionsQuerySchema,
  ExceptionsSummary,
  ExceptionsSummaryQuerySchema,
  MatchRecord,
} from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { MatchingService } from './matching.service';

export class ExceptionsQueryDto extends createZodDto(ExceptionsQuerySchema) {}
export class ExceptionsSummaryQueryDto extends createZodDto(ExceptionsSummaryQuerySchema) {}
export class CreditNoteApplyDto extends createZodDto(CreditNoteApplySchema) {}

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

  // FR-404: apply a received credit note to a held invoice.
  @Post('invoices/:id/apply-credit-note')
  @HttpCode(200)
  applyCreditNote(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreditNoteApplyDto,
  ): Promise<MatchRecord> {
    return this.matching.applyCreditNote(id, body.creditMinor, body.reference, user.sub);
  }

  @Get('exceptions')
  exceptions(@Query() query: ExceptionsQueryDto) {
    return this.matching.exceptions(query);
  }

  // FR-603: counts per reason for the queue header.
  @Get('exceptions/summary')
  exceptionsSummary(@Query() query: ExceptionsSummaryQueryDto): Promise<ExceptionsSummary> {
    return this.matching.exceptionsSummary(query);
  }
}
