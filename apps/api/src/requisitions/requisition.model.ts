import { RequisitionStatus } from '@trimatch/shared';
import { literal } from 'sequelize';
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { ApprovalStep } from '../approvals/approval-step.model';
import { User } from '../identity/user.model';

@Table({ tableName: 'requisitions', underscored: true, timestamps: true })
export class Requisition extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare requesterId: string;

  @BelongsTo(() => User)
  declare requester?: User;

  @AllowNull(false)
  @Default('draft')
  @Column(DataType.STRING(32))
  declare status: RequisitionStatus;

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare justification: string;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare neededBy: string;

  @AllowNull(false)
  @Column(DataType.CHAR(3))
  declare currency: string;

  // BIGINT comes back from pg as string — normalize at the service boundary.
  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare totalMinor: string | number;

  @HasMany(() => RequisitionLine)
  declare lines?: RequisitionLine[];

  @HasMany(() => ApprovalStep)
  declare steps?: ApprovalStep[];
}

@Table({ tableName: 'requisition_lines', underscored: true, timestamps: true })
export class RequisitionLine extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Requisition)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare requisitionId: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare lineNo: number;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  declare description: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  declare category: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare quantity: number;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare unitPriceMinor: string | number;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare lineTotalMinor: string | number;
}
