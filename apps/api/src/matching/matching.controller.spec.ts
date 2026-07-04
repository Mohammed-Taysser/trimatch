import { JwtPayload } from '../auth/decorators';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

const user: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000006',
  email: 'ap@demo',
  role: 'ap',
  tv: 0,
};
const INVOICE_ID = '019787c8-0000-4000-8000-00000000feed';

describe('match endpoint delegates with the acting AP clerk', () => {
  it('match passes the invoice and actor', async () => {
    const service = {
      match: jest.fn().mockResolvedValue({ id: 'rec-1', outcome: 'matched' }),
    } as unknown as MatchingService;
    const controller = new MatchingController(service);
    await controller.match(user, INVOICE_ID);
    expect(service.match).toHaveBeenCalledWith(INVOICE_ID, user.sub);
  });

  it('apply-credit-note passes the amount, reference and actor', async () => {
    const service = {
      applyCreditNote: jest.fn().mockResolvedValue({ id: 'rec-2', outcome: 'matched' }),
    } as unknown as MatchingService;
    const controller = new MatchingController(service);
    await controller.applyCreditNote(user, INVOICE_ID, { creditMinor: 500_00, reference: 'CN-1' });
    expect(service.applyCreditNote).toHaveBeenCalledWith(INVOICE_ID, 500_00, 'CN-1', user.sub);
  });

  it('queue and summary pass the filters straight through', async () => {
    const service = {
      exceptions: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      exceptionsSummary: jest.fn().mockResolvedValue({ total: 0, counts: [] }),
    } as unknown as MatchingService;
    const controller = new MatchingController(service);
    const query = {
      page: 1,
      pageSize: 20,
      reason: 'PRICE_VARIANCE' as const,
      sort: 'vendor' as const,
    };
    await controller.exceptions(query);
    expect(service.exceptions).toHaveBeenCalledWith(query);
    const summaryQuery = { olderThanDays: 5 };
    await controller.exceptionsSummary(summaryQuery);
    expect(service.exceptionsSummary).toHaveBeenCalledWith(summaryQuery);
  });
});
