import { literal } from 'sequelize';
import {
  AllowNull,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

// One override of a code-defined setting (869e01dmv). `scope`/`scopeId`/`key` are
// unique together; `value` is the raw JSON validated against the registry.
@Table({ tableName: 'settings', underscored: true, timestamps: true })
export class Setting extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Column(DataType.STRING(16))
  declare scope: 'company' | 'user';

  @AllowNull(false)
  @Default('')
  @Column(DataType.STRING(64))
  declare scopeId: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  declare key: string;

  @AllowNull(false)
  @Column(DataType.JSONB)
  declare value: unknown;
}
