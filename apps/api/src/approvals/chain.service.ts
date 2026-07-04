import { ConflictException, Injectable } from '@nestjs/common';
import { User } from '../identity/user.model';
import { computeChain } from './chain.compute';
import { MatrixService } from './matrix.service';

export interface ResolvedStep {
  stepNo: number;
  approverId: string;
  title: string;
}

// FR-501: turn the computed title chain into concrete approvers.
// Team Lead / Department Head resolve through the reporting hierarchy;
// named titles (Finance Director, CEO, CISO) resolve via users.job_title.
@Injectable()
export class ChainService {
  constructor(private readonly matrix: MatrixService) {}

  async buildChain(
    requester: User,
    amountMinor: number,
    categories: string[],
  ): Promise<ResolvedStep[]> {
    const ruleset = await this.matrix.activeRuleset();
    const titles = computeChain(ruleset.rules, {
      amountMinor,
      department: requester.department,
      categories,
    });
    if (titles.length === 0) {
      throw new ConflictException({
        code: 'NO_APPROVER',
        message: 'No matrix rule matches this requisition',
      });
    }

    const steps: ResolvedStep[] = [];
    const seen = new Set<string>();
    for (const title of titles) {
      const approverId = await this.resolveTitle(title, requester);
      if (seen.has(approverId)) continue; // same person twice → one step
      seen.add(approverId);
      steps.push({ stepNo: steps.length + 1, approverId, title });
    }
    return steps;
  }

  private async resolveTitle(title: string, requester: User): Promise<string> {
    // ADR-0007: the resolved approver must be active. Named titles come from the
    // users pool (filtered in the query); hierarchy titles resolve through
    // manager_id and are fetched so a deactivated manager fails loudly
    // (NO_APPROVER) rather than being handed an approval step they can't act on.
    if (title === 'Team Lead') {
      const lead = requester.managerId ? await User.findByPk(requester.managerId) : null;
      if (!lead?.active) this.unresolvable(title);
      return (lead as User).id;
    }
    if (title === 'Department Head') {
      const manager = requester.managerId ? await User.findByPk(requester.managerId) : null;
      const head = manager?.managerId ? await User.findByPk(manager.managerId) : null;
      if (!head?.active) this.unresolvable(title);
      return (head as User).id;
    }
    const holder = await User.findOne({ where: { jobTitle: title, active: true } });
    if (!holder) this.unresolvable(title);
    return (holder as User).id;
  }

  private unresolvable(title: string): never {
    throw new ConflictException({
      code: 'NO_APPROVER',
      message: `No approver found for chain title '${title}'`,
    });
  }
}
