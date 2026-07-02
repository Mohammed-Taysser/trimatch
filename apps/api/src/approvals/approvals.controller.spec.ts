import { JwtPayload } from '../auth/decorators';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

const approver: JwtPayload = {
  sub: '019787c8-0000-4000-8000-000000000002',
  email: 'lead@demo',
  role: 'approver',
};
const STEP_ID = '019787c8-0000-4000-8000-00000000bbbb';

describe('approval endpoints delegate with the authenticated approver', () => {
  const service = {
    inbox: jest.fn().mockResolvedValue([]),
    decide: jest.fn().mockResolvedValue(undefined),
  } as unknown as ApprovalsService;
  const controller = new ApprovalsController(service);
  const page = { page: 1, pageSize: 20 };

  it('inbox is scoped to the current approver', async () => {
    await controller.inbox(approver, page);
    expect(service.inbox).toHaveBeenCalledWith(approver.sub, page);
  });

  it('approve and reject pass the decision and reason through', async () => {
    await controller.approve(approver, STEP_ID);
    expect(service.decide).toHaveBeenCalledWith(STEP_ID, approver.sub, 'approved');
    await controller.reject(approver, STEP_ID, { reason: 'too expensive' });
    expect(service.decide).toHaveBeenCalledWith(STEP_ID, approver.sub, 'rejected', 'too expensive');
  });
});
