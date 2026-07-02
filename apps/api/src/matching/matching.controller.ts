import { Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { MatchRecord } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { MatchingService } from './matching.service';

@Controller('invoices')
@Roles('ap', 'admin')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post(':id/match')
  @HttpCode(200)
  match(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchRecord> {
    return this.matching.match(id, user.sub);
  }
}
