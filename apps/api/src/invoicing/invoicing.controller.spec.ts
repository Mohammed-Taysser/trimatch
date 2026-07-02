import { JwtPayload } from '../auth/decorators';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';

const user: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000006',
  email: 'ap@demo',
  role: 'ap',
};
const INVOICE_ID = '019787c8-0000-4000-8000-00000000f00d';

describe('invoice endpoints delegate with the acting AP clerk', () => {
  const service = {
    create: jest.fn().mockResolvedValue({ id: INVOICE_ID }),
    findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    findOne: jest.fn().mockResolvedValue({ id: INVOICE_ID }),
  } as unknown as InvoicingService;
  const controller = new InvoicingController(service);
  const page = { page: 1, pageSize: 20 };
  const body = {
    poId: '019787c8-0000-4000-8000-00000000beef',
    invoiceNumber: 'INV-77',
    invoiceDate: '2026-07-02',
    taxMinor: 0,
    totalMinor: 100,
    lines: [{ poLineId: '019787c8-0000-4000-8000-00000000cafe', quantity: 1, unitPriceMinor: 100 }],
  };

  it('create passes the payload and actor', async () => {
    await controller.create(user, body);
    expect(service.create).toHaveBeenCalledWith(body, user.sub);
  });

  it('list and get delegate', async () => {
    await controller.list(page);
    await controller.get(INVOICE_ID);
    expect(service.findAll).toHaveBeenCalledWith(page);
    expect(service.findOne).toHaveBeenCalledWith(INVOICE_ID);
  });
});
