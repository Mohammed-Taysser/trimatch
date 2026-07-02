import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { InboxItem } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto';
import { PagedResult } from '../common/paged';
import { ApprovalsService } from './approvals.service';
import { RejectRequestDto } from './dto';

@Controller('approvals')
@Roles('approver')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('inbox')
  inbox(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PagedResult<InboxItem>> {
    return this.approvals.inbox(user.sub, query);
  }

  @Post('steps/:id/approve')
  @HttpCode(204)
  async approve(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.approvals.decide(id, user.sub, 'approved');
  }

  @Post('steps/:id/reject')
  @HttpCode(204)
  async reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectRequestDto,
  ): Promise<void> {
    await this.approvals.decide(id, user.sub, 'rejected', body.reason);
  }
}
