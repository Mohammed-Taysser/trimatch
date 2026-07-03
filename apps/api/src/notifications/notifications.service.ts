import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  Notification as NotificationView,
  NotificationJob,
  NotificationSchema,
  NotificationsQuery,
} from '@trimatch/shared';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { Notification } from './notification.model';

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification) private readonly notifications: typeof Notification) {}

  // Called by the queue worker when a hand-off enqueues a notification.
  async create(job: NotificationJob): Promise<NotificationView> {
    const row = await this.notifications.create({
      recipientId: job.recipientId,
      type: job.type,
      message: job.message,
      entityType: job.entityType ?? null,
      entityId: job.entityId ?? null,
    });
    return this.toView(row);
  }

  async findAllOwn(
    recipientId: string,
    query: NotificationsQuery,
  ): Promise<PagedResult<NotificationView>> {
    const where =
      query.unread === undefined ? { recipientId } : { recipientId, read: !query.unread };
    const { rows, count } = await this.notifications.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      ...pageOffset(query),
    });
    return new PagedResult(
      rows.map((row) => this.toView(row)),
      pageMeta(query, count),
    );
  }

  // Marks one notification read. Scoped to the recipient: another user's row is
  // indistinguishable from a missing one (no cross-user existence leak).
  async markRead(id: string, recipientId: string): Promise<NotificationView> {
    const row = await this.notifications.findOne({ where: { id, recipientId } });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification not found' });
    }
    if (!row.read) {
      await row.update({ read: true });
    }
    return this.toView(row);
  }

  private toView(row: Notification): NotificationView {
    return NotificationSchema.parse({
      id: row.id,
      recipientId: row.recipientId,
      type: row.type,
      entityType: row.entityType ?? null,
      entityId: row.entityId ?? null,
      message: row.message,
      read: row.read,
      createdAt: (row.createdAt as Date).toISOString(),
      updatedAt: (row.updatedAt as Date).toISOString(),
    });
  }
}
