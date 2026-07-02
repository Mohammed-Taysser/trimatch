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
}
