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
import { PoVersion, PurchaseOrder } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto';
import { PagedResult } from '../common/paged';
import { ConvertRequisitionDto, PoAmendDto, PoLinesUpdateDto, PoListQueryDto } from './dto';
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

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrder> {
    return this.purchasing.cancel(id, user.sub);
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
  @Roles('purchasing', 'admin', 'warehouse', 'ap')
  list(@Query() query: PoListQueryDto): Promise<PagedResult<PurchaseOrder>> {
    return this.purchasing.findAll(query);
  }

  @Get(':id')
  @Roles('purchasing', 'admin', 'warehouse', 'ap')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrder> {
    return this.purchasing.findOne(id);
  }

  // FR-604: amendments — version N+1; a total increase needs re-approval.
  @Post(':id/amend')
  @HttpCode(200)
  amend(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PoAmendDto,
  ): Promise<PurchaseOrder> {
    return this.purchasing.amend(id, body, user.sub);
  }

  @Post(':id/approve-amendment')
  @HttpCode(200)
  @Roles('approver', 'admin')
  approveAmendment(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrder> {
    return this.purchasing.approveAmendment(id, user.sub);
  }

  @Get(':id/versions')
  @Roles('purchasing', 'admin', 'warehouse', 'ap', 'approver')
  versions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PagedResult<PoVersion>> {
    return this.purchasing.versions(id, query);
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
