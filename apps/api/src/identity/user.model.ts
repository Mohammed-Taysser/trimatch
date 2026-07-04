import { UserRole } from '@trimatch/shared';
import { literal } from 'sequelize';
import {
  AllowNull,
  Column,
  Default,
  DataType,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';

@Table({ tableName: 'users', underscored: true, timestamps: true })
export class User extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING)
  declare email: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare fullName: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare passwordHash: string;

  @AllowNull(false)
  @Column(DataType.STRING(32))
  declare role: UserRole;

  @Column(DataType.UUID)
  declare managerId: string | null;

  @Column(DataType.STRING(100))
  declare department: string | null;

  @Column(DataType.STRING(100))
  declare jobTitle: string | null;

  // ADR-0007 tier 1: deactivation marker. A deactivated user cannot log in and
  // is excluded from approver pools; the row is never physically deleted so
  // history always resolves the real actor. Reversible.
  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare active: boolean;
}
