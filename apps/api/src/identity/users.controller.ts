import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { UserAdmin, UserUpdateSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto';
import { PagedResult } from '../common/paged';
import { UsersService } from './users.service';

export class UserUpdateDto extends createZodDto(UserUpdateSchema) {}

// Superadmin dashboard: user management stays admin-only and audit-logged.
@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: PaginationQueryDto): Promise<PagedResult<UserAdmin>> {
    return this.users.listAll(query);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UserUpdateDto,
  ): Promise<UserAdmin> {
    return this.users.update(id, body, user.sub);
  }
}
