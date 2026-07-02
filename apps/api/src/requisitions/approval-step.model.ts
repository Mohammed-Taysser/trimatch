import { literal } from 'sequelize';
import {
  AllowNull,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { User } from '../identity/user.model';
import { Requisition } from './requisition.model';

// Chain snapshot (ADR-0002): steps are frozen at submission; `round` supports
// revise-and-resubmit history (FR-105).
@Table({ tableName: 'approval_steps', underscored: true, timestamps: true })
export class ApprovalStep extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Requisition)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare requisitionId: string;

  @AllowNull(false)
  @Default(1)
  @Column(DataType.INTEGER)
  declare round: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare stepNo: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare approverId: string;

  @AllowNull(false)
  @Default('pending')
  @Column(DataType.STRING(16))
  declare status: 'pending' | 'approved' | 'rejected';

  @Column(DataType.TEXT)
  declare reason: string | null;

  @Column(DataType.DATE)
  declare decidedAt: Date | null;
}
