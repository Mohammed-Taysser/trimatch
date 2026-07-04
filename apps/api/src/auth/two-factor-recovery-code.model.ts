import { literal } from 'sequelize';
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { User } from '../identity/user.model';

// A single-use TOTP recovery code (869dzycut). Only the bcrypt hash is stored;
// `usedAt` enforces single-use. Codes are (re)issued when 2FA is enabled and
// cleared when it is disabled.
@Table({ tableName: 'two_factor_recovery_codes', underscored: true, timestamps: true })
export class TwoFactorRecoveryCode extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @AllowNull(false)
  @Column(DataType.STRING(72))
  declare codeHash: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  declare usedAt: Date | null;
}
