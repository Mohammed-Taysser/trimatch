import { JwtPayload } from '../auth/decorators';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

const user: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000004',
  email: 'purchasing@demo',
  role: 'purchasing',
  tv: 0,
};
const PO_ID = '019787c8-0000-4000-8000-00000000cccc';
const REQ_ID = '019787c8-0000-4000-8000-00000000dddd';
const VENDOR_ID = '019787c8-0000-4000-8000-00000000eeee';

describe('purchase order endpoints delegate with the authenticated officer', () => {
  const service = {
    convert: jest.fn().mockResolvedValue({ id: PO_ID }),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: PO_ID }),
    updateLines: jest.fn().mockResolvedValue({ id: PO_ID }),
    issue: jest.fn().mockResolvedValue({ id: PO_ID, status: 'issued' }),
    cancel: jest.fn().mockResolvedValue({ id: PO_ID, status: 'cancelled' }),
    amend: jest.fn().mockResolvedValue({ id: PO_ID, version: 2 }),
    approveAmendment: jest.fn().mockResolvedValue({ id: PO_ID, status: 'issued' }),
    close: jest.fn().mockResolvedValue({ id: PO_ID, status: 'closed' }),
    versions: jest.fn().mockResolvedValue({ items: [], meta: {} }),
  } as unknown as PurchasingService;
  const controller = new PurchasingController(service);
  const page = { page: 1, pageSize: 20 };
  const lines = [
    { description: 'x', category: 'IT', vendorSku: null, quantity: 1, unitPriceMinor: 1 },
  ];

  it('convert passes requisition, vendor and actor', async () => {
    await controller.convert(user, { requisitionId: REQ_ID, vendorId: VENDOR_ID });
    expect(service.convert).toHaveBeenCalledWith(REQ_ID, VENDOR_ID, user.sub);
  });

  it('issue passes the acting officer', async () => {
    await controller.issue(user, PO_ID);
    expect(service.issue).toHaveBeenCalledWith(PO_ID, user.sub);
  });

  it('cancel passes the acting officer', async () => {
    await controller.cancel(user, PO_ID);
    expect(service.cancel).toHaveBeenCalledWith(PO_ID, user.sub);
  });

  it('list/get/updateLines delegate', async () => {
    await controller.list(page);
    await controller.get(PO_ID);
    await controller.updateLines(user, PO_ID, { lines });
    expect(service.findAll).toHaveBeenCalledWith(page);
    expect(service.findOne).toHaveBeenCalledWith(PO_ID);
    expect(service.updateLines).toHaveBeenCalledWith(PO_ID, lines, user.sub);
  });

  it('amend and approve-amendment carry the acting user; versions is read-only', async () => {
    const amendment = {
      reason: 'vendor price change',
      lines: [{ poLineId: '019787c8-0000-4000-8000-00000000dcba', unitPriceMinor: 60_00 }],
    };
    await controller.amend(user, PO_ID, amendment);
    expect(service.amend).toHaveBeenCalledWith(PO_ID, amendment, user.sub);
    await controller.approveAmendment(user, PO_ID);
    expect(service.approveAmendment).toHaveBeenCalledWith(PO_ID, user.sub);
    await controller.close(user, PO_ID);
    expect(service.close).toHaveBeenCalledWith(PO_ID, user.sub);
    await controller.versions(PO_ID, page);
    expect(service.versions).toHaveBeenCalledWith(PO_ID, page);
  });
});
