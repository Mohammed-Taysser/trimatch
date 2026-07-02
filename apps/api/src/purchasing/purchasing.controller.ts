import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PurchaseOrder } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto';
import { PagedResult } from '../common/paged';
import { ConvertRequisitionDto, PoLinesUpdateDto } from './dto';
import { PurchasingService } from './purchasing.service';

@Controller('purchase-orders')
@Roles('purchasing', 'admin')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Post('from-requisition')
  convert(
    @CurrentUser() user: JwtPayload,
    @Body() body: ConvertRequisitionDto,
  ): Promise<PurchaseOrder> {
    return this.purchasing.convert(body.requisitionId, body.vendorId, user.sub);
  }

  @Post(':id/issue')
  @HttpCode(200)
  issue(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrder> {
    return this.purchasing.issue(id, user.sub);
  }

  @Get()
  list(@Query() query: PaginationQueryDto): Promise<PagedResult<PurchaseOrder>> {
    return this.purchasing.findAll(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrder> {
    return this.purchasing.findOne(id);
  }

  @Put(':id/lines')
  updateLines(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PoLinesUpdateDto,
  ): Promise<PurchaseOrder> {
    return this.purchasing.updateLines(id, body.lines, user.sub);
  }
}
