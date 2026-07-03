import { NotificationsQuerySchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class NotificationsQueryDto extends createZodDto(NotificationsQuerySchema) {}
