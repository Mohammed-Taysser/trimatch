import { literal } from 'sequelize';
import {
  AllowNull,
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

// Versioned immutable rows (ADR-0002) — a new admin save creates version N+1.
@Table({ tableName: 'matrix_rules', underscored: true, timestamps: true, updatedAt: false })
export class MatrixRule extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare version: number;

  @AllowNull(false)
  @Column(DataType.STRING(10))
  declare ruleLabel: string;

  @AllowNull(false)
  @Default('base')
  @Column(DataType.STRING(10))
  declare kind: 'base' | 'append';

  @Column(DataType.BIGINT)
  declare minAmountMinor: string | number | null;

  @Column(DataType.BIGINT)
  declare maxAmountMinor: string | number | null;

  @Column(DataType.STRING(100))
  declare department: string | null;

  @Column(DataType.STRING(100))
  declare category: string | null;

  @AllowNull(false)
  @Column(DataType.JSONB)
  declare chain: string[];

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare createdBy: string;

  @CreatedAt
  declare createdAt: Date;
}
