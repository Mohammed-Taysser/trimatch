import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Grn } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { PagedResult } from '../common/paged';
import { GrnCreateDto, GrnListQueryDto } from './dto';
import { ReceivingService } from './receiving.service';

@Controller('receipts')
@Roles('warehouse', 'admin')
export class ReceivingController {
  constructor(private readonly receiving: ReceivingService) {}

  @Post()
  receive(@CurrentUser() user: JwtPayload, @Body() body: GrnCreateDto): Promise<Grn> {
    return this.receiving.receive(body, user.sub);
  }

  // FR-601: receipt history for one PO — many receipts accumulate over time.
  @Get()
  list(@Query() query: GrnListQueryDto): Promise<PagedResult<Grn>> {
    return this.receiving.listByPo(query);
  }
}
