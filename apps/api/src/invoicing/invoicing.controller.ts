import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Invoice } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto';
import { PagedResult } from '../common/paged';
import { InvoiceCreateDto, ResolutionRequestDto } from './dto';
import { InvoicingService } from './invoicing.service';

@Controller('invoices')
@Roles('ap', 'admin')
export class InvoicingController {
  constructor(private readonly invoicing: InvoicingService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: InvoiceCreateDto): Promise<Invoice> {
    return this.invoicing.create(body, user.sub);
  }

  @Post(':id/accept-variance')
  @HttpCode(200)
  acceptVariance(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolutionRequestDto,
  ): Promise<Invoice> {
    return this.invoicing.resolve(id, 'variance_accepted', user.sub, body.reason);
  }

  @Post(':id/request-credit-note')
  @HttpCode(200)
  requestCreditNote(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolutionRequestDto,
  ): Promise<Invoice> {
    return this.invoicing.resolve(id, 'awaiting_credit_note', user.sub, body.reason);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolutionRequestDto,
  ): Promise<Invoice> {
    return this.invoicing.resolve(id, 'rejected', user.sub, body.reason);
  }

  @Get()
  list(@Query() query: PaginationQueryDto): Promise<PagedResult<Invoice>> {
    return this.invoicing.findAll(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Invoice> {
    return this.invoicing.findOne(id);
  }
}
