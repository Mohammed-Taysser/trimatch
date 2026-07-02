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
    if (title === 'Team Lead') {
      if (!requester.managerId) this.unresolvable(title);
      return requester.managerId as string;
    }
    if (title === 'Department Head') {
      const manager = requester.managerId ? await User.findByPk(requester.managerId) : null;
      if (!manager?.managerId) this.unresolvable(title);
      return manager?.managerId as string;
    }
    const holder = await User.findOne({ where: { jobTitle: title } });
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
