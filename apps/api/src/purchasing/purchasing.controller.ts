import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { PurchaseOrder } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
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

  @Get()
  list(): Promise<PurchaseOrder[]> {
    return this.purchasing.findAll();
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
