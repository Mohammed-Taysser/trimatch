import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Delegation, DelegationCreateSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto';
import { PagedResult } from '../common/paged';
import { DelegationsService } from './delegations.service';

export class DelegationCreateDto extends createZodDto(DelegationCreateSchema) {}

@Controller('delegations')
@Roles('approver', 'admin')
export class DelegationsController {
  constructor(private readonly delegations: DelegationsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: DelegationCreateDto): Promise<Delegation> {
    return this.delegations.create(user.sub, body.delegateEmail, body.startsOn, body.endsOn);
  }

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PagedResult<Delegation>> {
    return this.delegations.listOwn(user.sub, query);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.delegations.revoke(id, user.sub);
  }
}
