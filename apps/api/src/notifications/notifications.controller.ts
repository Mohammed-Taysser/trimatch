import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Notification } from '@trimatch/shared';
import { CurrentUser, JwtPayload } from '../auth/decorators';
import { PagedResult } from '../common/paged';
import { NotificationsQueryDto } from './dto';
import { NotificationsService } from './notifications.service';

// No @Roles gate: any authenticated user reads their OWN notifications. Every
// method scopes to user.sub so one user can never see or touch another's.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: NotificationsQueryDto,
  ): Promise<PagedResult<Notification>> {
    return this.notifications.findAllOwn(user.sub, query);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Notification> {
    return this.notifications.markRead(id, user.sub);
  }
}
