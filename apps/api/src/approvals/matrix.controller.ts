import { Body, Controller, Get, Post } from '@nestjs/common';
import { MatrixRuleset, MatrixRulesetCreateSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, JwtPayload, Roles } from '../auth/decorators';
import { MatrixService } from './matrix.service';

export class MatrixRulesetCreateDto extends createZodDto(MatrixRulesetCreateSchema) {}

@Controller('matrix-rules')
@Roles('admin')
export class MatrixController {
  constructor(private readonly matrix: MatrixService) {}

  @Get()
  active(): Promise<MatrixRuleset> {
    return this.matrix.activeRuleset();
  }

  @Post()
  createVersion(
    @CurrentUser() user: JwtPayload,
    @Body() body: MatrixRulesetCreateDto,
  ): Promise<MatrixRuleset> {
    return this.matrix.createVersion(body, user.sub);
  }
}
