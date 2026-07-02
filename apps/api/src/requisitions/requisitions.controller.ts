import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Requisition } from '@trimatch/shared';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { RequisitionCreateDto, RequisitionUpdateDto } from './dto';
import { RequisitionsService } from './requisitions.service';

@Controller('requisitions')
export class RequisitionsController {
  constructor(private readonly requisitions: RequisitionsService) {}

  @Post()
  @Roles('requester')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() body: RequisitionCreateDto,
  ): Promise<Requisition> {
    return this.requisitions.create(user.sub, body);
  }

  @Get()
  @Roles('requester')
  list(@CurrentUser() user: JwtPayload): Promise<Requisition[]> {
    return this.requisitions.findAllOwn(user.sub);
  }

  @Post(':id/submit')
  @Roles('requester')
  @HttpCode(200)
  submit(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Requisition> {
    return this.requisitions.submit(id, user.sub);
  }

  @Post(':id/revise')
  @Roles('requester')
  @HttpCode(200)
  revise(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Requisition> {
    return this.requisitions.revise(id, user.sub);
  }

  @Get(':id')
  @Roles('requester')
  get(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Requisition> {
    return this.requisitions.findOwn(id, user.sub);
  }

  @Put(':id')
  @Roles('requester')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequisitionUpdateDto,
  ): Promise<Requisition> {
    return this.requisitions.update(id, user.sub, body);
  }

  @Delete(':id')
  @Roles('requester')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.requisitions.remove(id, user.sub);
  }
}
