import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

const VENDOR_ID = '019787c8-0000-4000-8000-00000000ffff';

describe('vendor endpoints delegate to the vendors service', () => {
  const service = {
    create: jest.fn().mockResolvedValue({ id: VENDOR_ID }),
    findAll: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ id: VENDOR_ID }),
  } as unknown as VendorsService;
  const controller = new VendorsController(service);
  const page = { page: 1, pageSize: 20 };
  const input = {
    name: 'ACME',
    contactEmail: 'a@acme.example',
    currency: 'USD',
    paymentTerms: 'NET 30',
  };

  it('create and update delegate', async () => {
    await controller.create(input);
    await controller.update(VENDOR_ID, { active: false });
    expect(service.create).toHaveBeenCalledWith(input);
    expect(service.update).toHaveBeenCalledWith(VENDOR_ID, { active: false });
  });

  it('list maps the active query flag', async () => {
    await controller.list(page, 'true');
    expect(service.findAll).toHaveBeenCalledWith(true, page);
    await controller.list(page, undefined);
    expect(service.findAll).toHaveBeenCalledWith(false, page);
  });
});
