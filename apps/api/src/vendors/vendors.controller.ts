import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Vendor } from '@trimatch/shared';
import { Roles } from '../auth/decorators';
import { PaginationQueryDto } from '../common/dto';
import { PagedResult } from '../common/paged';
import { VendorCreateDto, VendorUpdateDto } from './dto';
import { VendorsService } from './vendors.service';

@Controller('vendors')
@Roles('purchasing', 'admin')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Post()
  create(@Body() body: VendorCreateDto): Promise<Vendor> {
    return this.vendors.create(body);
  }

  @Get()
  list(
    @Query() query: PaginationQueryDto,
    @Query('active') active?: string,
  ): Promise<PagedResult<Vendor>> {
    return this.vendors.findAll(active === 'true', query);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: VendorUpdateDto): Promise<Vendor> {
    return this.vendors.update(id, body);
  }
}
