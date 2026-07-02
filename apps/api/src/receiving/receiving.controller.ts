import { Body, Controller, Post } from '@nestjs/common';
import { Grn } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { GrnCreateDto } from './dto';
import { ReceivingService } from './receiving.service';

@Controller('receipts')
@Roles('warehouse', 'admin')
export class ReceivingController {
  constructor(private readonly receiving: ReceivingService) {}

  @Post()
  receive(@CurrentUser() user: JwtPayload, @Body() body: GrnCreateDto): Promise<Grn> {
    return this.receiving.receive(body, user.sub);
  }
}
