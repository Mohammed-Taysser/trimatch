import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('audit browser endpoint delegates the filters', () => {
  it('list passes entity filters and pagination through', async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    } as unknown as AuditService;
    const controller = new AuditController(service);
    const query = {
      page: 1,
      pageSize: 20,
      entityType: 'requisition',
      entityId: '019787c8-0000-4000-8000-00000000cccc',
    };
    await controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });
});
