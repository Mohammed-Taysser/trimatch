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

// A single-use, time-limited password-reset OTP. The delivered code is never
// stored — only its bcrypt hash — and `usedAt`/`attempts` enforce single-use and
// bound brute-force alongside the throttler.
@Table({ tableName: 'password_reset_otps', underscored: true, timestamps: true })
export class PasswordResetOtp extends Model {
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

  @AllowNull(false)
  @Column(DataType.DATE)
  declare expiresAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  declare usedAt: Date | null;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  declare attempts: number;
}
