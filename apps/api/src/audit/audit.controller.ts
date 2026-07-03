import { Controller, Get, Query } from '@nestjs/common';
import { AuditEntry, AuditQuerySchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../auth/decorators';
import { PagedResult } from '../common/paged';
import { AuditService } from './audit.service';

export class AuditQueryDto extends createZodDto(AuditQuerySchema) {}

// Read-only: the trail itself is append-only at the database level (I-7).
@Controller('audit')
@Roles('admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQueryDto): Promise<PagedResult<AuditEntry>> {
    return this.audit.list(query);
  }
}
