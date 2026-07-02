import { literal } from 'sequelize';
import {
  AllowNull,
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { User } from '../identity/user.model';
import { Invoice } from '../invoicing/invoice.model';
import { LineComparison, MatchReason, ToleranceConfig } from './tolerance.rules';

// Append-only (FR-405): DB trigger refuses UPDATE/DELETE.
@Table({ tableName: 'match_records', underscored: true, timestamps: true, updatedAt: false })
export class MatchRecord extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Invoice)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare invoiceId: string;

  @BelongsTo(() => Invoice)
  declare invoice?: Invoice;

  @AllowNull(false)
  @Column(DataType.STRING(16))
  declare outcome: 'matched' | 'exception';

  @AllowNull(false)
  @Column(DataType.JSONB)
  declare tolerances: ToleranceConfig;

  @AllowNull(false)
  @Column(DataType.JSONB)
  declare comparisons: LineComparison[];

  @AllowNull(false)
  @Column(DataType.JSONB)
  declare reasons: MatchReason[];

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare expectedTotalMinor: string | number;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare totalDeltaMinor: string | number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare matchedBy: string;

  @CreatedAt
  declare createdAt: Date;
}
