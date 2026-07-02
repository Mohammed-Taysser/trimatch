import { ConflictException } from '@nestjs/common';

// One implementation, four lifecycles (architecture §3): each lifecycle from
// domain doc §3 is an explicit transition map; invalid moves throw
// 409 INVALID_TRANSITION (NFR-03).
export interface Transition<S extends string> {
  from: S;
  to: S;
}

export class StateMachine<S extends string> {
  constructor(
    private readonly entityName: string,
    private readonly transitions: readonly Transition<S>[],
  ) {}

  canTransition(from: S, to: S): boolean {
    return this.transitions.some((t) => t.from === from && t.to === to);
  }

  assertCanTransition(from: S, to: S): void {
    if (!this.canTransition(from, to)) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: `A ${this.entityName} in state '${from}' cannot move to '${to}'`,
      });
    }
  }
}
