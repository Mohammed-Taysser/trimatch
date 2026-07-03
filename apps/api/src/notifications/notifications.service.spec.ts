import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Notification } from './notification.model';

const RECIPIENT = '019787c8-0000-4000-8000-000000000001';

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '019787c8-0000-4000-8000-0000000000aa',
    recipientId: RECIPIENT,
    type: 'requisition.approved',
    entityType: null,
    entityId: null,
    message: 'Your requisition was approved',
    read: false,
    createdAt: new Date('2026-07-03T12:00:00.000Z'),
    updatedAt: new Date('2026-07-03T12:00:00.000Z'),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function serviceWith(model: Partial<Record<string, jest.Mock>>): NotificationsService {
  return new NotificationsService(model as unknown as typeof Notification);
}

describe('NotificationsService', () => {
  it('create persists the job payload and returns the view', async () => {
    const create = jest.fn().mockResolvedValue(row());
    const service = serviceWith({ create });
    const view = await service.create({
      recipientId: RECIPIENT,
      type: 'requisition.approved',
      message: 'Your requisition was approved',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: RECIPIENT, entityType: null, entityId: null }),
    );
    expect(view.read).toBe(false);
    expect(view.createdAt).toBe('2026-07-03T12:00:00.000Z');
  });

  it('findAllOwn scopes to the recipient with no read filter by default', async () => {
    const findAndCountAll = jest.fn().mockResolvedValue({ rows: [row()], count: 1 });
    const service = serviceWith({ findAndCountAll });
    const result = await service.findAllOwn(RECIPIENT, {
      page: 1,
      pageSize: 20,
      unread: undefined,
    });
    expect(findAndCountAll.mock.calls[0][0].where).toEqual({ recipientId: RECIPIENT });
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
  });

  it('findAllOwn with unread=true filters to unread rows', async () => {
    const findAndCountAll = jest.fn().mockResolvedValue({ rows: [], count: 0 });
    const service = serviceWith({ findAndCountAll });
    await service.findAllOwn(RECIPIENT, { page: 1, pageSize: 20, unread: true });
    expect(findAndCountAll.mock.calls[0][0].where).toEqual({ recipientId: RECIPIENT, read: false });
  });

  it('findAllOwn with unread=false filters to read rows', async () => {
    const findAndCountAll = jest.fn().mockResolvedValue({ rows: [], count: 0 });
    const service = serviceWith({ findAndCountAll });
    await service.findAllOwn(RECIPIENT, { page: 1, pageSize: 20, unread: false });
    expect(findAndCountAll.mock.calls[0][0].where).toEqual({ recipientId: RECIPIENT, read: true });
  });

  it('markRead flips an unread notification to read', async () => {
    const r = row({ read: false });
    const findOne = jest.fn().mockResolvedValue(r);
    const service = serviceWith({ findOne });
    await service.markRead(r.id, RECIPIENT);
    expect(findOne).toHaveBeenCalledWith({ where: { id: r.id, recipientId: RECIPIENT } });
    expect(r.update).toHaveBeenCalledWith({ read: true });
  });

  it('markRead is a no-op write when already read', async () => {
    const r = row({ read: true });
    const service = serviceWith({ findOne: jest.fn().mockResolvedValue(r) });
    const view = await service.markRead(r.id, RECIPIENT);
    expect(r.update).not.toHaveBeenCalled();
    expect(view.read).toBe(true);
  });

  it('markRead throws NotFound when the row is missing or not the recipient', async () => {
    const service = serviceWith({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(
      service.markRead('019787c8-0000-4000-8000-0000000000ff', RECIPIENT),
    ).rejects.toThrow(NotFoundException);
  });
});
