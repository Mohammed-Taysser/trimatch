import { JwtPayload } from '../auth/decorators';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

const user: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000006',
  email: 'ap@demo',
  role: 'ap',
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
});
