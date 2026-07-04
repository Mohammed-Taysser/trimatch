import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { SettingUpdateSchema, SettingView } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { SettingsService } from './settings.service';

export class SettingUpdateDto extends createZodDto(SettingUpdateSchema) {}

// Company settings are admin-only; a user manages their own preferences under
// /me. Values are validated against the code registry in the service.
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Roles('admin')
  @Get('company')
  company(): Promise<SettingView[]> {
    return this.settings.companyView();
  }

  @Roles('admin')
  @Put('company/:key')
  setCompany(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
    @Body() body: SettingUpdateDto,
  ): Promise<SettingView> {
    return this.settings.setCompany(key, body.value, user.sub);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload): Promise<SettingView[]> {
    return this.settings.userView(user.sub);
  }

  @Put('me/:key')
  setMine(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
    @Body() body: SettingUpdateDto,
  ): Promise<SettingView> {
    return this.settings.setForUser(key, body.value, user.sub);
  }
}
