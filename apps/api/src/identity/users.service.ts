import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PaginationQuery, UserAdmin, UserAdminSchema, UserUpdate } from '@trimatch/shared';
import { AuditService } from '../audit/audit.service';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { User } from './user.model';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly audit: AuditService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.userModel.findByPk(id);
  }

  // Superadmin dashboard: the org, paginated, with manager names resolved.
  async listAll(query: PaginationQuery): Promise<PagedResult<UserAdmin>> {
    const { rows, count } = await this.userModel.findAndCountAll({
      order: [['fullName', 'ASC']],
      ...pageOffset(query),
    });
    const managerIds = [...new Set(rows.map((row) => row.managerId).filter(Boolean))] as string[];
    const managers = managerIds.length
      ? await this.userModel.findAll({ where: { id: managerIds } })
      : [];
    const nameById = new Map(managers.map((manager) => [manager.id, manager.fullName]));
    return new PagedResult(
      rows.map((row) => this.toAdminView(row, nameById.get(row.managerId ?? '') ?? null)),
      pageMeta(query, count),
    );
  }

  // Role/manager changes are admin actions with full audit rows; changing
  // your own role is refused so an admin cannot silently lock themselves out
  // (or up) — another admin must do it.
  async update(id: string, input: UserUpdate, actorId: string): Promise<UserAdmin> {
    const user = await this.userModel.findByPk(id);
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    }
    if (input.role !== undefined && id === actorId) {
      throw new ConflictException({
        code: 'SELF_ROLE_CHANGE',
        message: 'You cannot change your own role — ask another admin',
      });
    }
    let managerName: string | null = null;
    if (input.managerId !== undefined && input.managerId !== null) {
      if (input.managerId === id) {
        throw new ConflictException({
          code: 'SELF_MANAGER',
          message: 'A user cannot be their own manager',
        });
      }
      const manager = await this.userModel.findByPk(input.managerId);
      if (!manager) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Manager not found' });
      }
      managerName = manager.fullName;
    }

    if (input.role !== undefined && input.role !== user.role) {
      const from = user.role;
      await user.update({ role: input.role });
      await this.audit.record({
        entityType: 'user',
        entityId: id,
        actorId,
        action: 'user.role_changed',
        fromState: from,
        toState: input.role,
      });
    }
    if (input.managerId !== undefined && input.managerId !== user.managerId) {
      // from/to state columns are varchar(32) lifecycle states — names go in
      // the comment instead of UUIDs
      const previous = user.managerId ? await this.userModel.findByPk(user.managerId) : null;
      await user.update({ managerId: input.managerId });
      await this.audit.record({
        entityType: 'user',
        entityId: id,
        actorId,
        action: 'user.manager_changed',
        comment: `manager: ${previous?.fullName ?? 'none'} → ${managerName ?? 'none'}`,
      });
    }
    if (user.managerId && managerName === null) {
      const manager = await this.userModel.findByPk(user.managerId);
      managerName = manager?.fullName ?? null;
    }
    return this.toAdminView(user, managerName);
  }

  private toAdminView(row: User, managerName: string | null): UserAdmin {
    return UserAdminSchema.parse({
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      managerId: row.managerId,
      managerName,
      department: row.department,
      jobTitle: row.jobTitle,
    });
  }
}
