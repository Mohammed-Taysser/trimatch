import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Invoice } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto';
import { PagedResult } from '../common/paged';
import { InvoiceCreateDto } from './dto';
import { InvoicingService } from './invoicing.service';

@Controller('invoices')
@Roles('ap', 'admin')
export class InvoicingController {
  constructor(private readonly invoicing: InvoicingService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: InvoiceCreateDto): Promise<Invoice> {
    return this.invoicing.create(body, user.sub);
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
