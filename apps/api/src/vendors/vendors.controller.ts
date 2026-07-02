import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Vendor } from '@trimatch/shared';
import { Roles } from '../auth/decorators';
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
  list(@Query('active') active?: string): Promise<Vendor[]> {
    return this.vendors.findAll(active === 'true');
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: VendorUpdateDto): Promise<Vendor> {
    return this.vendors.update(id, body);
  }
}
